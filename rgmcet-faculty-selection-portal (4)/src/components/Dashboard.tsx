import { useEffect, useState } from "react";
import { auth, db } from "../firebase";
import { 
  collection, 
  onSnapshot, 
  doc, 
  getDoc, 
  updateDoc, 
  runTransaction
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { LogOut, User, CheckCircle, AlertCircle, Shield, BarChart3, Clock, Printer, FileText, ArrowLeft, Download } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { OperationType, handleFirestoreError, cn } from "../lib/utils";
// @ts-ignore
import html2pdf from "html2pdf.js";

interface Student {
  registrationNumber: string;
  name: string;
  branch: string;
  year: string;
  phoneNumber: string;
  group: 'A' | 'B';
  section: 'A1' | 'A2' | 'A3' | 'A4';
  selections: Record<string, string>;
  isSubmitted: boolean;
  submittedAt?: string;
}

interface Subject {
  id: string;
  name: string;
}

interface Faculty {
  id: string;
  name: string;
  subjectId: string;
  studentCount: number;
  group: string;
  section: string;
}

export default function Dashboard() {
  const [student, setStudent] = useState<Student | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let unsubStudent: (() => void) | null = null;
    let unsubSubjects: (() => void) | null = null;
    let unsubFaculty: (() => void) | null = null;

    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      if (!user || !user.uid) {
        if (unsubStudent) unsubStudent();
        if (unsubSubjects) unsubSubjects();
        if (unsubFaculty) unsubFaculty();
        navigate("/");
        return;
      }

      // Fetch student details
      try {
        const userDocRef = doc(db, "users", user.uid);
        let userDoc = await getDoc(userDocRef);
        
        if (!userDoc.exists()) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          userDoc = await getDoc(userDocRef);
        }

        let regNo = userDoc.data()?.registrationNumber;

        if (!regNo) {
          toast.error("Account not linked to a student record.");
          setLoading(false);
          return;
        }

        const studentRef = doc(db, "students", regNo);
        unsubStudent = onSnapshot(studentRef, (snap) => {
          if (snap.exists()) {
            const data = snap.data() as Student;
            setStudent(data);
            setSelections(data.selections || {});
          } else {
            toast.error("Student record not found.");
          }
          setLoading(false);
        }, (err) => {
          if (auth.currentUser) {
            handleFirestoreError(err, OperationType.GET, `students/${regNo}`);
          }
        });

        // Fetch subjects and faculty only after auth
        unsubSubjects = onSnapshot(collection(db, "subjects"), (snap) => {
          const allSubjects = snap.docs.map(d => ({ id: d.id, ...d.data() } as Subject));
          setSubjects(allSubjects);
        }, (err) => {
          if (auth.currentUser) {
            handleFirestoreError(err, OperationType.LIST, "subjects");
          }
        });

        unsubFaculty = onSnapshot(collection(db, "faculty"), (snap) => {
          const allFaculty = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
          // Filter faculty by student's group if student data is available
          setFaculty(allFaculty);
        }, (err) => {
          if (auth.currentUser) {
            handleFirestoreError(err, OperationType.LIST, "faculty");
          }
        });
      } catch (err) {
        console.error("Error in Dashboard auth listener:", err);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubStudent) unsubStudent();
      if (unsubSubjects) unsubSubjects();
      if (unsubFaculty) unsubFaculty();
    };
  }, [navigate]);

  // Filtered faculty based on student's group
  const filteredFaculty = faculty.filter(f => !student || f.group === student.group);

  const handleSelect = async (subjectId: string, facultyId: string) => {
    if (!student || student.isSubmitted) return;
    
    const newSelections = { ...selections, [subjectId]: facultyId };
    setSelections(newSelections);

    // Update student document in background to track "Live" counts
    try {
      const studentRef = doc(db, "students", student.registrationNumber);
      await updateDoc(studentRef, { selections: newSelections });
    } catch (err) {
      console.error("Failed to update live selection:", err);
    }
  };

  const handleSubmit = async () => {
    if (!student || submitting) return;
    
    // Double check submission state before starting
    if (student.isSubmitted) {
      toast.error("You have already submitted.");
      setShowConfirm(false);
      return;
    }

    setSubmitting(true);
    // Close modal immediately to prevent double clicks and confusion
    setShowConfirm(false);

    try {
      await runTransaction(db, async (transaction) => {
        // 1. ALL READS FIRST
        const studentRef = doc(db, "students", student.registrationNumber);
        const studentSnap = await transaction.get(studentRef);
        
        const currentData = studentSnap.data();
        if (currentData?.isSubmitted) {
          throw new Error("Already submitted.");
        }

        // Validate all subjects are selected
        if (Object.keys(selections).length < subjects.length) {
          throw new Error("Please select faculty for all subjects.");
        }

        // Read all faculty data
        const facultyDataToUpdate: { ref: any, snap: any, currentCount: number }[] = [];
        for (const facultyId of Object.values(selections) as string[]) {
          const facultyRef = doc(db, "faculty", facultyId);
          const facultySnap = await transaction.get(facultyRef);
          const currentCount = facultySnap.data()?.studentCount || 0;

          if (currentCount >= 70) {
            throw new Error(`Faculty ${facultySnap.data()?.name} is full.`);
          }
          
          facultyDataToUpdate.push({ ref: facultyRef, snap: facultySnap, currentCount });
        }

        // 2. ALL WRITES SECOND
        for (const f of facultyDataToUpdate) {
          transaction.update(f.ref, { studentCount: f.currentCount + 1 });
        }

        transaction.update(studentRef, {
          selections,
          isSubmitted: true,
          submittedAt: new Date().toISOString()
        });
      });

      // Immediate success feedback
      toast.success("Selections submitted successfully!");
      
      const selectionDetails = Object.entries(selections).reduce((acc, [subId, facId]) => {
        const subName = subjects.find(s => s.id === subId)?.name || subId;
        const facName = faculty.find(f => f.id === facId)?.name || facId;
        acc[subName] = facName;
        return acc;
      }, {} as Record<string, string>);

      const studentEmail = `${student.registrationNumber.toLowerCase()}@rgmcet.edu.in`;

      try {
        const emailResponse = await fetch("/api/email/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentEmail,
            studentName: student.name,
            selections: selectionDetails
          })
        });
        
        const emailResult = await emailResponse.json();
        if (!emailResponse.ok) {
          console.error("Email failed:", emailResult.error);
          let errorMsg = "Confirmation email failed to send.";
          if (emailResult.debug) {
            errorMsg += ` (User: ${emailResult.debug.user}, Pass Length: ${emailResult.debug.passLength}). ${emailResult.debug.tip}`;
          }
          toast.warning(errorMsg, { duration: 10000 });
        } else {
          if (emailResult.message && emailResult.message.includes("mocked")) {
            toast.warning("Email Mocked: Please configure EMAIL_USER and EMAIL_PASS in Secrets.", { duration: 10000 });
          } else {
            toast.success("Confirmation email sent successfully!");
          }
        }
      } catch (emailError) {
        console.error("Failed to send confirmation email:", emailError);
        toast.warning("Email service is currently unavailable.");
      }
    } catch (error: any) {
      toast.error(error.message);
      // If it's already submitted, we should ensure the modal is closed
      if (error.message === "Already submitted.") {
        setShowConfirm(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center font-bold uppercase tracking-widest text-text-muted animate-pulse">
      Initializing Secure Session...
    </div>
  );

  if (!student) return null;

  return (
    <div className="min-h-screen bg-background text-text p-4 sm:p-6 flex flex-col">
      <div className="max-w-7xl mx-auto w-full space-y-4 sm:space-y-8 relative z-10">
        {/* Header */}
        <header className="professional-card p-4 sm:p-6 flex flex-col sm:flex-row justify-between items-center gap-4 sm:gap-6">
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 w-full sm:w-auto">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white rounded-xl flex items-center justify-center overflow-hidden shadow-sm border border-border">
                <img 
                  src="https://rgmcet.edu.in/assets/img/logo/logo.jpg" 
                  alt="RGMCET Logo" 
                  className="w-10 h-10 sm:w-12 sm:h-12 object-contain"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "https://picsum.photos/seed/college/100/100";
                  }}
                />
              </div>
              <h1 className="text-2xl sm:text-4xl font-bold text-primary tracking-tight">RGMCET</h1>
            </div>
            <div className="h-px w-full sm:h-12 sm:w-px bg-border" />
            <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto">
              <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center shrink-0 border border-border">
                <User size={20} className="text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-bold truncate">{student?.name}</h2>
                <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted truncate">
                  {student?.registrationNumber} • {student?.branch} • Sec {student?.section} • Grp {student?.group}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
            <div className="flex flex-col items-start sm:items-end px-4 sm:px-6 border-r border-border">
              <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">System Status</span>
              <span className="text-[10px] font-bold text-green-600 uppercase tracking-widest">Secure</span>
            </div>
            <button 
              onClick={() => auth.signOut()}
              className="p-2.5 sm:p-3 bg-gray-50 hover:bg-red-50 text-text-muted hover:text-red-600 rounded-xl transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest border border-border"
              title="Logout"
            >
              <LogOut size={16} />
              <span className="hidden lg:inline">Logout</span>
            </button>
          </div>
        </header>

        {/* Status Banner */}
        {student?.isSubmitted && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="professional-card p-4 sm:p-6 border-primary/20 bg-primary/5 flex flex-col sm:flex-row justify-between items-center gap-4 sm:gap-6"
          >
            <div className="flex items-center gap-4 sm:gap-6">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
                <CheckCircle size={24} className="text-primary" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-primary">Selection Confirmed</h3>
                <p className="text-xs text-text-muted">Your faculty allocation request has been successfully processed.</p>
              </div>
            </div>
            <button 
              onClick={() => setShowReceipt(true)}
              className="w-full sm:w-auto btn-primary flex items-center justify-center gap-2"
            >
              <FileText size={16} />
              View Receipt
            </button>
          </motion.div>
        )}

        {/* Subjects Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {subjects.map((subject, index) => {
            const selectedFacultyId = selections[subject.id];
            const isCompleted = !!selectedFacultyId;
            const groupFaculty = faculty.filter(f => f.subjectId === subject.id && f.group === student.group);

            return (
              <div key={subject.id} className={`professional-card overflow-hidden flex flex-col ${isCompleted ? "border-primary/30 ring-1 ring-primary/10" : ""}`}>
                <div className="p-4 sm:p-6 border-b border-border bg-gray-50/50">
                  <div className="flex justify-between items-start mb-3 sm:mb-4">
                    <span className="text-2xl font-bold text-gray-200">{(index + 1).toString().padStart(2, '0')}</span>
                    {isCompleted && <CheckCircle size={20} className="text-primary" />}
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-text mb-1">{subject.name}</h3>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Module ID: {subject.id}</p>
                </div>

                <div className="p-3 sm:p-6 space-y-1.5 sm:space-y-3 flex-1">
                  {groupFaculty.map(f => {
                    const isSelected = selections[subject.id] === f.id;
                    const liveCount = f.studentCount || 0;
                    const isFull = liveCount >= 70;

                    return (
                      <button
                        key={f.id}
                        disabled={student?.isSubmitted || (isFull && !isSelected)}
                        onClick={() => handleSelect(subject.id, f.id)}
                        className={`w-full p-2.5 sm:p-4 rounded-xl border transition-all text-left relative ${
                          isSelected 
                            ? "bg-primary border-primary text-white shadow-md" 
                            : isFull 
                              ? "bg-red-50 border-red-100 text-red-300"
                              : "bg-white border-border hover:border-primary/50 text-text hover:bg-gray-50"
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        <div className="flex justify-between items-center">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${isSelected ? "bg-white/20" : "bg-gray-100"}`}>Section {f.section}</span>
                            </div>
                            <p className="font-bold text-sm leading-tight truncate">{f.name}</p>
                            {isFull && !isSelected && <p className="text-[8px] font-bold uppercase tracking-widest mt-1 text-red-500">Full Capacity</p>}
                          </div>
                          {isSelected && <CheckCircle size={16} className="shrink-0" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Submit Section */}
        {!student?.isSubmitted && (
          <div className="pt-8 sm:pt-12 pb-24 flex flex-col items-center gap-6">
            <div className="flex items-center gap-4 text-text-muted">
              <div className="h-px w-12 bg-border" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Final Execution</span>
              <div className="h-px w-12 bg-border" />
            </div>
            
            <button
              onClick={() => {
                if (student.isSubmitted) {
                  toast.error("You have already submitted.");
                  return;
                }
                setShowConfirm(true);
              }}
              disabled={submitting || Object.keys(selections).length < subjects.length}
              className="px-12 py-5 btn-primary text-lg"
            >
              Confirm Selections
            </button>
            
            <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
              {Object.keys(selections).length}/{subjects.length} Modules Selected
            </p>
          </div>
        )}

        {/* Footer */}
        <footer className="py-8 sm:py-12 border-t border-border flex flex-col sm:flex-row justify-between items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-text-muted">
          <div className="flex items-center gap-4">
            <span>© 2026 RGMCET System</span>
            <div className="w-1 h-1 rounded-full bg-border" />
            <span>Session: {auth.currentUser?.uid.slice(0, 8)}</span>
          </div>
          <div className="flex items-center gap-6">
            <span>V2.1.0 Stable</span>
          </div>
        </footer>
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirm && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white p-8 sm:p-12 rounded-3xl max-w-md w-full text-center shadow-2xl border border-border"
            >
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <AlertCircle size={32} className="text-primary" />
              </div>
              <h3 className="text-2xl font-bold text-text mb-3">Confirm Submission</h3>
              <p className="text-text-muted mb-8 leading-relaxed">
                Are you sure you want to finalize your selections? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowConfirm(false)}
                  disabled={submitting}
                  className="flex-1 px-6 py-4 rounded-xl font-bold uppercase tracking-widest text-text-muted hover:bg-gray-100 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-1 btn-primary"
                >
                  {submitting ? "Processing..." : "Confirm"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Receipt Modal */}
      <AnimatePresence>
        {showReceipt && student && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[60] p-4 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-2xl w-full bg-white p-6 sm:p-12 rounded-3xl relative shadow-2xl border border-border print:shadow-none print:border-none my-auto"
            >
              <div className="flex flex-col items-center text-center mb-8 sm:mb-12 print:mb-8">
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-green-100 rounded-2xl flex items-center justify-center mb-4 sm:mb-6 print:hidden">
                  <CheckCircle size={32} className="text-green-600" />
                </div>
                <h1 className="text-2xl sm:text-4xl font-bold text-primary mb-2 print:text-black">Submission Confirmed</h1>
                <p className="text-xs sm:text-sm text-text-muted uppercase tracking-widest font-semibold print:text-black/60">Official Selection Receipt</p>
              </div>

              <div className="space-y-6 sm:space-y-8 print:space-y-4">
                <div className="p-4 sm:p-8 bg-gray-50 rounded-2xl border border-border print:bg-white print:border-gray-300 print:text-black">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-1">Student Name</p>
                      <p className="font-bold text-base sm:text-lg">{student.name}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-1">Registration Number</p>
                      <p className="font-bold text-base sm:text-lg">{student.registrationNumber}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-1">Details</p>
                      <p className="font-semibold text-sm">{student.branch} • Section {student.section} • Group {student.group}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-1">Submission Date</p>
                      <p className="font-semibold text-sm">{student.submittedAt ? new Date(student.submittedAt).toLocaleString() : "N/A"}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted ml-1">Selected Faculty</h3>
                  <div className="grid gap-3">
                    {subjects.map(sub => {
                      const facultyId = student.selections?.[sub.id];
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
                  onClick={() => setShowReceipt(false)}
                  className="flex-1 px-6 py-4 rounded-xl font-bold uppercase tracking-widest text-text-muted hover:bg-gray-100 transition-all flex items-center justify-center gap-2"
                >
                  <ArrowLeft size={18} />
                  Close
                </button>
                <button 
                  onClick={() => {
                    const element = document.getElementById('receipt-content');
                    if (!element) return;
                    
                    const opt = {
                      margin:       0.5,
                      filename:     `${student.registrationNumber}_receipt.pdf`,
                      image:        { type: 'jpeg', quality: 0.98 },
                      html2canvas:  { scale: 2, useCORS: true },
                      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
                    };
                    
                    html2pdf().set(opt).from(element).save();
                  }}
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
        )}
      </AnimatePresence>
    </div>
  );
}
