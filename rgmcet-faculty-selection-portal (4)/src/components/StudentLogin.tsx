import React, { useState } from "react";
import { auth, db } from "../firebase";
import { signInAnonymously } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, collection, getDocs } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import bcrypt from "bcryptjs";
import { ArrowLeft, GraduationCap, AlertCircle, CheckCircle, Download, Printer, FileText } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { OperationType, handleFirestoreError } from "../lib/utils";
// @ts-ignore
import html2pdf from "html2pdf.js";

export default function StudentLogin() {
  const [regNo, setRegNo] = useState("");
  const [dob, setDob] = useState("");
  const [loading, setLoading] = useState(false);
  const [submittedStudent, setSubmittedStudent] = useState<any>(null);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [faculty, setFaculty] = useState<any[]>([]);
  const navigate = useNavigate();

  React.useEffect(() => {
    // Check if user is already signed in
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user && !user.isAnonymous) {
        // If signed in with Google (admin), sign out to allow student login
        auth.signOut();
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const normalizedRegNo = regNo.trim().toUpperCase();
      // 1. Check if student exists in Firestore
      const studentRef = doc(db, "students", normalizedRegNo);
      let studentSnap;
      try {
        studentSnap = await getDoc(studentRef);
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `students/${normalizedRegNo}`);
        return;
      }

      if (!studentSnap.exists()) {
        toast.error(`Student record not found for ${normalizedRegNo}. Please ensure you have seeded the data in the Admin Panel.`);
        return;
      }

      const studentData = studentSnap.data();

      // Check if already submitted
      if (studentData.isSubmitted) {
        setLoading(true);
        try {
          const subSnap = await getDocs(collection(db, "subjects"));
          const facSnap = await getDocs(collection(db, "faculty"));
          setSubjects(subSnap.docs.map(d => ({ id: d.id, ...d.data() })));
          setFaculty(facSnap.docs.map(d => ({ id: d.id, ...d.data() })));
          setSubmittedStudent(studentData);
          toast.info("You have already submitted your selections.");
        } catch (err) {
          console.error("Error fetching receipt data:", err);
          toast.error("Already submitted, but failed to load receipt data.");
        }
        setLoading(false);
        return;
      }
      
      // 2. Verify DOB hash
      // The user can now type DOB in DDMMYYYY format or DD/MM/YYYY
      let paddedDob = "";
      let unpaddedDob = "";

      if (dob.length === 8 && !dob.includes("/") && !dob.includes("-")) {
        const d = dob.slice(0, 2);
        const m = dob.slice(2, 4);
        const y = dob.slice(4, 8);
        paddedDob = `${d}-${m}-${y}`;
        unpaddedDob = `${parseInt(d)}-${parseInt(m)}-${y}`;
      } else if (dob.includes("/") || dob.includes("-")) {
        const parts = dob.split(/[\/-]/);
        if (parts.length === 3) {
          const [d, m, y] = parts;
          // Ensure day and month are padded for paddedDob
          const pd = d.padStart(2, '0');
          const pm = m.padStart(2, '0');
          paddedDob = `${pd}-${pm}-${y}`;
          unpaddedDob = `${parseInt(d)}-${parseInt(m)}-${y}`;
        }
      }

      if (!paddedDob) {
        toast.error("Please enter Date of Birth in DD/MM/YYYY format.");
        setLoading(false);
        return;
      }
      
      console.log(`Login attempt for ${regNo}: Trying ${paddedDob} and ${unpaddedDob}`);
      
      if (!studentData.dob) {
        toast.error("Student record is incomplete (missing DOB). Please contact admin.");
        return;
      }

      try {
        let isValid = false;
        
        // Try hashed comparison first
        try {
          const isPaddedValid = bcrypt.compareSync(paddedDob, studentData.dob);
          const isUnpaddedValid = bcrypt.compareSync(unpaddedDob, studentData.dob);
          isValid = isPaddedValid || isUnpaddedValid;
        } catch (bcryptError) {
          // If bcrypt fails (e.g. data is not a hash), try plain text comparison
          console.log("Bcrypt comparison failed, trying plain text...");
          isValid = (paddedDob === studentData.dob) || (unpaddedDob === studentData.dob);
        }
        
        if (!isValid) {
          toast.error("Invalid Date of Birth.");
          return;
        }
      } catch (error) {
        console.error("DOB Verification error:", error);
        toast.error("Error verifying Date of Birth. Please try again.");
        return;
      }

      // 3. Sign in anonymously
      let userCredential;
      try {
        userCredential = await signInAnonymously(auth);
      } catch (error: any) {
        console.error("Auth Error Details:", error);
        // Status 400 on signUp usually means Anonymous Auth is disabled
        if (error.code === "auth/admin-restricted-operation" || error.code === "auth/operation-not-allowed" || error.message?.includes("400")) {
          toast.error("Anonymous Authentication is disabled. Please enable it in Firebase Console > Authentication > Sign-in method.", {
            duration: 8000,
          });
          return;
        }
        throw error;
      }
      
      const user = userCredential.user;

      // 4. Link the UID to the student record in the users collection
      try {
        await setDoc(doc(db, "users", user.uid), {
          uid: user.uid,
          registrationNumber: normalizedRegNo,
          role: "student",
          lastLogin: new Date().toISOString()
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
        return;
      }

      // 5. Update student record with the current UID if it's different or missing
      try {
        if (studentData.uid !== user.uid) {
          await updateDoc(studentRef, {
            uid: user.uid
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `students/${normalizedRegNo}`);
        return;
      }

      toast.success("Login successful!");
      navigate("/dashboard");
    } catch (error: any) {
      console.error("Full Firebase Error:", error);
      if (error.code === 'auth/unauthorized-domain') {
        toast.error("Domain not authorized. Please add 'localhost' to Authorized Domains in Firebase Console.");
      } else {
        toast.error(error.message || "Login failed.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    const element = document.getElementById('receipt-content');
    if (!element) return;
    
    const opt = {
      margin:       0.5,
      filename:     `${submittedStudent.registrationNumber}_receipt.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    
    html2pdf().set(opt).from(element).save();
  };

  if (submittedStudent) {
    return (
      <div className="min-h-screen bg-background text-text flex items-center justify-center p-4 sm:p-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-2xl w-full professional-card p-6 sm:p-12 relative z-10 print:shadow-none print:border-none print:p-0"
        >
          <div className="flex flex-col items-center text-center mb-8 sm:mb-12 print:mb-8">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-green-100 rounded-2xl flex items-center justify-center mb-4 sm:mb-6 print:hidden">
              <CheckCircle size={32} className="text-green-600" />
            </div>
            <h1 className="text-2xl sm:text-4xl font-bold text-primary mb-2 print:text-black">Submission Confirmed</h1>
            <p className="text-xs sm:text-sm text-text-muted uppercase tracking-widest font-semibold print:text-black/60">Official Selection Receipt</p>
          </div>

          <div id="receipt-content" className="space-y-6 sm:space-y-8 print:space-y-4">
            <div className="p-4 sm:p-8 bg-gray-50 rounded-2xl border border-border print:bg-white print:border-gray-300 print:text-black">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-1">Student Name</p>
                  <p className="font-bold text-base sm:text-lg">{submittedStudent.name}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-1">Registration Number</p>
                  <p className="font-bold text-base sm:text-lg">{submittedStudent.registrationNumber}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-1">Details</p>
                  <p className="font-semibold text-sm">{submittedStudent.branch} • Section {submittedStudent.section} • Group {submittedStudent.group}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-1">Submission Date</p>
                  <p className="font-semibold text-sm">{new Date(submittedStudent.submittedAt).toLocaleString()}</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted ml-1">Selected Faculty</h3>
              <div className="grid gap-3">
                {subjects.map(sub => {
                  const facultyId = submittedStudent.selections?.[sub.id];
                  const fac = faculty.find(f => f.id === facultyId);
                  return (
                    <div key={sub.id} className="flex justify-between items-center p-4 bg-white border border-border rounded-xl print:border-gray-200">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-1">{sub.name}</p>
                        <p className="font-bold text-sm">{fac?.name || "N/A"}</p>
                        <p className="text-[10px] text-text-muted mt-0.5">Section {fac?.section}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-1">Faculty ID</p>
                        <p className="font-mono text-xs font-semibold">{facultyId}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-8 sm:mt-12 flex flex-col sm:flex-row gap-3 sm:gap-4 print:hidden">
            <button 
              onClick={() => setSubmittedStudent(null)}
              className="flex-1 px-6 py-4 rounded-xl font-bold uppercase tracking-widest text-text-muted hover:bg-gray-100 transition-all flex items-center justify-center gap-2"
            >
              <ArrowLeft size={18} />
              Back
            </button>
            <button 
              onClick={handlePrint}
              className="flex-1 btn-primary flex items-center justify-center gap-2"
            >
              <Download size={18} />
              Download Receipt
            </button>
          </div>

          <div className="mt-8 sm:mt-12 pt-6 sm:pt-8 border-t border-border flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-text-muted print:text-black/40">
            <span>© 2026 RGMCET System</span>
            <span>Official Receipt</span>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-text flex items-center justify-center p-4 sm:p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full professional-card p-8 sm:p-12"
      >
        <button 
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-text-muted hover:text-primary transition-colors mb-8 sm:mb-12 group"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Back to Home</span>
        </button>

        <div className="flex flex-col items-center text-center mb-8 sm:mb-12">
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white rounded-2xl flex items-center justify-center overflow-hidden shadow-sm border border-border mb-4 sm:mb-6">
            <img 
              src="https://rgmcet.edu.in/assets/img/logo/logo.jpg" 
              alt="RGMCET Logo" 
              className="w-12 h-12 sm:w-16 sm:h-16 object-contain"
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "https://picsum.photos/seed/college/100/100";
              }}
            />
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-primary tracking-tight mb-2">RGMCET</h1>
          <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Student Portal</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6 sm:space-y-8">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted ml-1">Registration Number</label>
            <input
              type="text"
              required
              placeholder="e.g. 2x091A05xx"
              value={regNo}
              onChange={(e) => setRegNo(e.target.value.toUpperCase())}
              className="input-field"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted ml-1">Date of Birth</label>
            <div className="relative">
              <input
                type="text"
                required
                placeholder="DD/MM/YYYY"
                value={dob}
                inputMode="numeric"
                maxLength={10}
                onChange={(e) => {
                  const inputVal = e.target.value;
                  
                  // If the user is deleting (backspacing), just update the state directly
                  // This prevents the cursor from jumping and allows deleting slashes
                  if (inputVal.length < dob.length) {
                    setDob(inputVal);
                    return;
                  }
                  
                  // Otherwise, format the input automatically
                  let val = inputVal.replace(/\D/g, ""); // Keep only digits
                  if (val.length > 8) val = val.slice(0, 8);
                  
                  let formatted = val;
                  if (val.length > 4) {
                    formatted = `${val.slice(0, 2)}/${val.slice(2, 4)}/${val.slice(4)}`;
                  } else if (val.length > 2) {
                    formatted = `${val.slice(0, 2)}/${val.slice(2)}`;
                  }
                  
                  setDob(formatted);
                }}
                className="input-field pr-12"
              />
              <input 
                type="date"
                className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 opacity-0 cursor-pointer"
                onChange={(e) => {
                  if (e.target.value) {
                    const [y, m, d] = e.target.value.split("-");
                    setDob(`${d}/${m}/${y}`);
                  }
                }}
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted">
                <FileText size={18} />
              </div>
            </div>
            <p className="text-[10px] text-text-muted ml-1">Enter as DDMY (e.g. 08012003) or use picker</p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary"
          >
            {loading ? "Authenticating..." : "Access Portal"}
          </button>
        </form>

        <p className="mt-8 text-[11px] text-center text-text-muted leading-relaxed">
          Having trouble? Contact your department coordinator or visit the admin office.
        </p>

        <div className="mt-12 pt-8 border-t border-border flex justify-between items-center text-[9px] font-bold uppercase tracking-widest text-text-muted">
          <span>© 2026 RGMCET System</span>
          <span>PID: {auth.app.options.projectId?.slice(0, 8)}</span>
        </div>
      </motion.div>
    </div>
  );
}
