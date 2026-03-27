import { useEffect, useState, useRef } from "react";
import { db, auth } from "../firebase";
import { 
  collection, 
  onSnapshot, 
  doc, 
  getDoc,
  setDoc,
  updateDoc, 
  deleteDoc, 
  writeBatch,
  getDocs,
  query,
  where
} from "firebase/firestore";
import { toast } from "sonner";
import { Download, RotateCcw, Users, BarChart3, ShieldCheck, LogOut, User, CheckCircle, AlertCircle, Shield, Clock, Search, Trash2, Database, Upload } from "lucide-react";
import bcrypt from "bcryptjs";
import { useNavigate } from "react-router-dom";
import { OperationType, handleFirestoreError } from "../lib/utils";
import { studentData } from "../data/students";
import { facultyData, subjectsData } from "../data/faculty";
import { motion, AnimatePresence } from "motion/react";
import Papa from "papaparse";

interface Student {
  registrationNumber: string;
  name: string;
  branch: string;
  year: string;
  group: 'A' | 'B';
  section: 'A1' | 'A2' | 'A3' | 'A4';
  selections: Record<string, string>;
  isSubmitted: boolean;
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

export default function Admin() {
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const facultyFileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const handleStudentFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      let text = e.target?.result as string;
      // Remove the first line if it's the "RGMCET - Automation" title row
      if (text.startsWith("RGMCET")) {
        text = text.substring(text.indexOf("\n") + 1);
      }

      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const parsedData = results.data as any[];
          
          // Validate and map CSV data
          const newStudentData = parsedData.map((row, index) => {
            let group = row.group || row.Group;
            let section = row.section || row.Section;
            
            if (!group || !section) {
              if (index < 72) { group = 'A'; section = 'A1'; }
              else if (index < 144) { group = 'A'; section = 'A2'; }
              else if (index < 216) { group = 'B'; section = 'A3'; }
              else { group = 'B'; section = 'A4'; }
            }

            return {
              regNo: row.HTNO || row.regNo || row.RegistrationNumber || row['Registration Number'],
              name: row.Name || row.name,
              dob: row.DoB || row.dob || row.DOB,
              branch: row.branch || row.Branch || "CSE",
              group,
              section
            };
          }).filter(s => s.regNo && s.name && s.dob);

          if (newStudentData.length === 0) {
            toast.error("No valid student data found in CSV. Please check headers (HTNO, Name, DoB).");
            return;
          }

          seedStudentData(newStudentData);
        },
        error: (error: any) => {
          toast.error(`Error parsing CSV: ${error.message}`);
        }
      });
    };
    reader.readAsText(file);
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFacultyFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      let text = e.target?.result as string;
      // Remove BOM if present
      if (text.charCodeAt(0) === 0xFEFF) {
        text = text.slice(1);
      }

      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const parsedData = results.data as any[];
          
          const newSubjects: any[] = [];
          const newFaculty: any[] = [];
          
          // Keep track of how many times a subject appears in a group to assign sections A1/A2 or A3/A4
          const subjectGroupCounts: Record<string, number> = {};

          parsedData.forEach((row) => {
            const facultyName = row['Faculty Name'] || row.facultyName || row.name;
            const subjectName = row['Subject Name'] || row.subjectName || row.subject;
            const group = row['Group'] || row.group;

            if (!facultyName || !subjectName || !group) return;

            // Generate subject ID (e.g., "Machine Learning" -> "ML")
            const subjectId = subjectName.split(' ').map((w: string) => w[0]).join('').toUpperCase();
            
            if (!newSubjects.find(s => s.id === subjectId)) {
              newSubjects.push({ id: subjectId, name: subjectName });
            }

            const key = `${subjectId}_${group}`;
            subjectGroupCounts[key] = (subjectGroupCounts[key] || 0) + 1;
            
            let section = '';
            if (group === 'A') {
              section = subjectGroupCounts[key] === 1 ? 'A1' : 'A2';
            } else if (group === 'B') {
              section = subjectGroupCounts[key] === 1 ? 'A3' : 'A4';
            }

            const facultyId = `${subjectId}_${section}`;

            newFaculty.push({
              id: facultyId,
              name: facultyName,
              subjectId: subjectId,
              group: group,
              section: section
            });
          });

          if (newFaculty.length === 0) {
            toast.error("No valid faculty data found in CSV. Please check headers (Faculty Name, Subject Name, Group).");
            return;
          }

          seedFacultyData(newSubjects, newFaculty);
        },
        error: (error: any) => {
          toast.error(`Error parsing CSV: ${error.message}`);
        }
      });
    };
    reader.readAsText(file);
    
    // Reset input
    if (facultyFileInputRef.current) {
      facultyFileInputRef.current.value = '';
    }
  };

  const filteredStudents = students.filter(s => 
    s.registrationNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    `grp_${s.group}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    let unsubStudents: (() => void) | null = null;
    let unsubSubjects: (() => void) | null = null;
    let unsubFaculty: (() => void) | null = null;

    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        if (unsubStudents) unsubStudents();
        if (unsubSubjects) unsubSubjects();
        if (unsubFaculty) unsubFaculty();
        navigate("/admin/login");
        return;
      }

      // Check if user is admin
      try {
        // First check if the user is the primary admin by email
        if (user.email === "sirimajjari7474@gmail.com" && user.emailVerified) {
          // Ensure record exists
          await setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            email: user.email,
            role: "admin"
          }, { merge: true });
        } else {
          const userDocRef = doc(db, "users", user.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (!userDoc.exists() || userDoc.data().role !== "admin") {
            toast.error("Access denied. Admin privileges required.");
            await auth.signOut();
            navigate("/admin/login");
            return;
          }
        }

        unsubStudents = onSnapshot(collection(db, "students"), (snap) => {
          setStudents(snap.docs.map(d => d.data() as Student));
        }, (err) => {
          if (auth.currentUser) {
            handleFirestoreError(err, OperationType.LIST, "students");
          }
        });
        
        unsubSubjects = onSnapshot(collection(db, "subjects"), (snap) => {
          setSubjects(snap.docs.map(d => ({ id: d.id, ...d.data() } as Subject)));
        }, (err) => {
          if (auth.currentUser) {
            handleFirestoreError(err, OperationType.LIST, "subjects");
          }
        });
        
        unsubFaculty = onSnapshot(collection(db, "faculty"), (snap) => {
          setFaculty(snap.docs.map(d => ({ id: d.id, ...d.data() } as Faculty)));
          setLoading(false);
        }, (err) => {
          if (auth.currentUser) {
            handleFirestoreError(err, OperationType.LIST, "faculty");
          }
        });
      } catch (err) {
        console.error("Error in Admin auth listener:", err);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubStudents) unsubStudents();
      if (unsubSubjects) unsubSubjects();
      if (unsubFaculty) unsubFaculty();
    };
  }, [navigate]);

  const exportCSV = () => {
    const headers = ["Reg No", "Name", "Branch", "Year", ...subjects.map(s => s.name)];
    const rows = students.map(s => [
      s.registrationNumber,
      s.name,
      s.branch,
      s.year,
      ...subjects.map(sub => {
        const facId = s.selections?.[sub.id];
        return faculty.find(f => f.id === facId)?.name || "N/A";
      })
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "student_selections.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadSubjectReport = (subjectId: string) => {
    const subject = subjects.find(s => s.id === subjectId);
    if (!subject) return;

    const subjectFaculty = faculty.filter(f => f.subjectId === subjectId);
    const headers = ["Registration Number", "Student Name", "Branch", "Group", "Selected Faculty"];
    const rows: string[][] = [];

    subjectFaculty.forEach(f => {
      const selectedStudents = students.filter(s => s.selections?.[subjectId] === f.id);
      selectedStudents.forEach(s => {
        rows.push([
          s.registrationNumber,
          s.name,
          s.branch,
          s.group || "N/A",
          f.name
        ]);
      });
    });

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${subject.name.replace(/\s+/g, '_')}_Selections.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadStudentList = (isSubmitted: boolean) => {
    const list = students.filter(s => s.isSubmitted === isSubmitted);
    const headers = ["Registration Number", "Student Name", "Branch", "Group", "Status"];
    const rows = list.map(s => [
      s.registrationNumber,
      s.name,
      s.branch,
      s.group || "N/A",
      isSubmitted ? "COMPLETED" : "PENDING"
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `student_${isSubmitted ? "completed" : "pending"}_list.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadGroupReport = (group: 'A' | 'B') => {
    const groupStudents = students.filter(s => s.group === group);
    const headers = ["Reg No", "Name", "Branch", "Section", "Status", ...subjects.map(s => s.name)];
    const rows = groupStudents.map(s => [
      s.registrationNumber,
      s.name,
      s.branch,
      s.section,
      s.isSubmitted ? "COMPLETED" : "PENDING",
      ...subjects.map(sub => {
        const facId = s.selections?.[sub.id];
        return faculty.find(f => f.id === facId)?.name || "N/A";
      })
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Group_${group}_Report.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const resetAll = async () => {
    setShowResetConfirm(false);
    try {
      const batch = writeBatch(db);
      
      // Reset students
      students.forEach(s => {
        const ref = doc(db, "students", s.registrationNumber);
        batch.update(ref, { selections: {}, isSubmitted: false });
      });

      // Reset faculty counts
      faculty.forEach(f => {
        const ref = doc(db, "faculty", f.id);
        batch.update(ref, { studentCount: 0 });
      });

      await batch.commit();
      toast.success("All selections reset successfully.");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const seedStudentData = async (customStudentData: any[]) => {
    if (seeding) return;
    setSeeding(true);
    const toastId = toast.loading("Seeding students... This may take a moment due to secure hashing.");
    
    try {
      // Clear existing students
      const studentsSnap = await getDocs(collection(db, "students"));
      
      const deleteDocs = async (snap: any) => {
        let i = 0;
        let batch = writeBatch(db);
        for (const d of snap.docs) {
          batch.delete(d.ref);
          i++;
          if (i === 500) {
            await batch.commit();
            batch = writeBatch(db);
            i = 0;
          }
        }
        if (i > 0) await batch.commit();
      };

      await deleteDocs(studentsSnap);

      // Seed real students from custom upload
      let batch = writeBatch(db);
      let count = 0;
      
      const processedStudents = customStudentData.map((s) => {
        const hashedDob = bcrypt.hashSync(s.dob, 10);
        
        return {
          registrationNumber: s.regNo,
          name: s.name,
          branch: s.branch,
          year: "3rd",
          phoneNumber: "",
          dob: hashedDob,
          group: s.group,
          section: s.section,
          selections: {},
          isSubmitted: false
        };
      });

      for (const s of processedStudents) {
        batch.set(doc(db, "students", s.registrationNumber), s);
        count++;
        if (count === 500) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }

      // Create admin user record
      if (auth.currentUser) {
        batch.set(doc(db, "users", auth.currentUser.uid), {
          uid: auth.currentUser.uid,
          email: auth.currentUser.email,
          role: "admin"
        }, { merge: true });
      }

      if (count > 0) await batch.commit();
      
      toast.success(`Database seeded successfully with ${processedStudents.length} students!`, { id: toastId });
    } catch (e: any) {
      console.error("Seeding error:", e);
      toast.error(`Error: ${e.message}`, { id: toastId });
    } finally {
      setSeeding(false);
    }
  };

  const seedFacultyData = async (customSubjectsData: any[], customFacultyData: any[]) => {
    if (seeding) return;
    setSeeding(true);
    const toastId = toast.loading("Seeding faculty and subjects...");
    
    try {
      // Clear existing subjects and faculty
      const subjectsSnap = await getDocs(collection(db, "subjects"));
      const facultySnap = await getDocs(collection(db, "faculty"));
      
      const deleteDocs = async (snap: any) => {
        let i = 0;
        let batch = writeBatch(db);
        for (const d of snap.docs) {
          batch.delete(d.ref);
          i++;
          if (i === 500) {
            await batch.commit();
            batch = writeBatch(db);
            i = 0;
          }
        }
        if (i > 0) await batch.commit();
      };

      await deleteDocs(subjectsSnap);
      await deleteDocs(facultySnap);

      // Seed new data
      let batch = writeBatch(db);
      let count = 0;
      
      customSubjectsData.forEach(s => {
        batch.set(doc(db, "subjects", s.id), s);
        count++;
      });

      customFacultyData.forEach(f => {
        batch.set(doc(db, "faculty", f.id), { ...f, studentCount: 0 });
        count++;
      });
      
      await batch.commit();
      
      toast.success(`Seeded ${customSubjectsData.length} subjects and ${customFacultyData.length} faculty members!`, { id: toastId });
    } catch (e: any) {
      console.error("Seeding error:", e);
      toast.error(`Error: ${e.message}`, { id: toastId });
    } finally {
      setSeeding(false);
    }
  };

  const clearDatabase = async () => {
    if (window.confirm("Are you sure? This will delete ALL student selections, subjects, and faculty data.")) {
      const toastId = toast.loading("Clearing database...");
      try {
        const subjectsSnap = await getDocs(collection(db, "subjects"));
        const facultySnap = await getDocs(collection(db, "faculty"));
        const studentsSnap = await getDocs(collection(db, "students"));
        
        const deleteDocs = async (snap: any) => {
          let i = 0;
          let batch = writeBatch(db);
          for (const d of snap.docs) {
            batch.delete(d.ref);
            i++;
            if (i === 500) {
              await batch.commit();
              batch = writeBatch(db);
              i = 0;
            }
          }
          if (i > 0) await batch.commit();
        };

        await deleteDocs(subjectsSnap);
        await deleteDocs(facultySnap);
        await deleteDocs(studentsSnap);
        
        toast.success("Database cleared successfully!", { id: toastId });
      } catch (e: any) {
        toast.error(e.message, { id: toastId });
      }
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center font-bold uppercase tracking-widest text-text-muted animate-pulse">
      Initializing Admin Session...
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-text p-4 sm:p-6 flex flex-col">
      <div className="max-w-7xl mx-auto w-full space-y-4 sm:space-y-8 relative z-10">
        {/* Top Navigation Bar */}
        <header className="professional-card p-4 sm:p-6 flex flex-col lg:flex-row justify-between items-center gap-4 sm:gap-6">
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 w-full lg:w-auto">
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
                <Shield size={20} className="text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-bold truncate">Admin Command Center</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted truncate">Live Sync Active</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-center lg:justify-end gap-2 sm:gap-3 w-full lg:w-auto">
            <button 
              onClick={clearDatabase}
              className="p-2 sm:p-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest border border-red-100"
              title="Clear All Data"
            >
              <Trash2 size={16} />
              <span className="hidden xl:inline">Clear</span>
            </button>
            <button 
              onClick={() => navigate("/dashboard")}
              className="p-2 sm:p-3 bg-gray-50 hover:bg-gray-100 text-text-muted hover:text-primary rounded-xl transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest border border-border"
              title="View Student Portal"
            >
              <BarChart3 size={16} />
              <span className="hidden xl:inline">view student portal</span>
            </button>
            <input 
              type="file" 
              accept=".csv" 
              ref={fileInputRef} 
              onChange={handleStudentFileUpload} 
              className="hidden" 
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={seeding}
              className="p-2 sm:p-3 bg-primary/5 hover:bg-primary/10 text-primary rounded-xl transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest border border-primary/10 disabled:opacity-50"
              title="Upload Students CSV to Seed Data"
            >
              <Upload size={16} />
              <span className="hidden xl:inline">{seeding ? "Seeding..." : "Upload Students"}</span>
            </button>
            <input 
              type="file" 
              accept=".csv" 
              ref={facultyFileInputRef} 
              onChange={handleFacultyFileUpload} 
              className="hidden" 
            />
            <button 
              onClick={() => facultyFileInputRef.current?.click()}
              disabled={seeding}
              className="p-2 sm:p-3 bg-primary/5 hover:bg-primary/10 text-primary rounded-xl transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest border border-primary/10 disabled:opacity-50"
              title="Upload Faculty CSV to Seed Data"
            >
              <Upload size={16} />
              <span className="hidden xl:inline">{seeding ? "Seeding..." : "Upload Faculty"}</span>
            </button>
            <button 
              onClick={() => downloadGroupReport('A')}
              className="p-2 sm:p-3 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest border border-blue-100"
              title="Group A"
            >
              <Download size={16} />
              <span className="hidden xl:inline">group a</span>
            </button>
            <button 
              onClick={() => downloadGroupReport('B')}
              className="p-2 sm:p-3 bg-purple-50 hover:bg-purple-100 text-purple-600 rounded-xl transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest border border-purple-100"
              title="Group B"
            >
              <Download size={16} />
              <span className="hidden xl:inline">group b</span>
            </button>
            <button 
              onClick={exportCSV}
              className="p-2 sm:p-3 bg-gray-50 hover:bg-gray-100 text-text-muted hover:text-primary rounded-xl transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest border border-border"
              title="Export CSV"
            >
              <Download size={16} />
              <span className="hidden xl:inline">export csv</span>
            </button>
            <button 
              onClick={() => setShowResetConfirm(true)}
              className="p-2 sm:p-3 bg-gray-50 hover:bg-red-50 text-text-muted hover:text-red-600 rounded-xl transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest border border-border"
              title="Reset"
            >
              <RotateCcw size={16} />
              <span className="hidden xl:inline">reset</span>
            </button>
            <button 
              onClick={() => auth.signOut()}
              className="p-2 sm:p-3 bg-gray-50 hover:bg-red-50 text-text-muted hover:text-red-600 rounded-xl transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest border border-border"
              title="Logout"
            >
              <LogOut size={16} />
              <span className="hidden xl:inline">logout</span>
            </button>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {[
            { label: "Total Entities", value: students.length, icon: Users, color: "blue" },
            { label: "Submissions Confirmed", value: students.filter(s => s.isSubmitted).length, icon: CheckCircle, color: "green" },
            { label: "Pending Actions", value: students.filter(s => !s.isSubmitted).length, icon: Clock, color: "amber" }
          ].map((stat, i) => (
            <div key={i} className="professional-card p-6 sm:p-8 relative overflow-hidden group">
              <div className="flex justify-between items-start mb-4 sm:mb-6">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-50 rounded-xl flex items-center justify-center group-hover:bg-primary/10 transition-colors border border-border">
                  <stat.icon size={20} className="text-primary" />
                </div>
                <span className="text-3xl sm:text-4xl font-bold text-gray-100">{(i + 1).toString().padStart(2, '0')}</span>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted block mb-1 sm:mb-2">{stat.label}</span>
              <div className="flex items-baseline gap-2 sm:gap-3">
                <span className="text-3xl sm:text-5xl font-bold tracking-tight">{stat.value.toString().padStart(3, '0')}</span>
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Units</span>
              </div>
            </div>
          ))}
        </div>

        {/* Main Content Area */}
        <div className="grid grid-cols-1 gap-4 sm:gap-8">
          {/* Student Enquiry */}
          <div className="professional-card p-6 sm:p-8">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-6">Student Enquiry Status</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-green-50 rounded-2xl border border-green-100">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-green-600 text-sm">COMPLETED</span>
                    <button 
                      onClick={() => downloadStudentList(true)}
                      className="p-1.5 bg-white hover:bg-green-100 text-green-600 rounded-lg transition-all border border-green-200"
                      title="Download List"
                    >
                      <Download size={14} />
                    </button>
                  </div>
                  <span className="text-xl sm:text-2xl font-bold text-green-700">{students.filter(s => s.isSubmitted).length}</span>
                </div>
                  <div className="max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                    {students.filter(s => s.isSubmitted).map(s => (
                      <div key={s.registrationNumber} className="text-xs p-3 bg-gray-50 rounded-xl flex justify-between items-center group hover:bg-white hover:shadow-sm border border-transparent hover:border-border transition-all">
                        <div className="flex flex-col">
                          <span className="font-bold text-text">{s.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-text-muted font-bold">{s.registrationNumber}</span>
                            <span className="text-[9px] text-primary/60 font-mono">DOB: {s.dob?.length > 20 ? "Hashed" : s.dob}</span>
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[8px] font-bold ${s.group === 'A' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
                          GRP_{s.group}
                        </span>
                      </div>
                    ))}
                  </div>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-amber-50 rounded-2xl border border-amber-100">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-amber-600 text-sm">PENDING</span>
                    <button 
                      onClick={() => downloadStudentList(false)}
                      className="p-1.5 bg-white hover:bg-amber-100 text-amber-600 rounded-lg transition-all border border-amber-200"
                      title="Download List"
                    >
                      <Download size={14} />
                    </button>
                  </div>
                  <span className="text-xl sm:text-2xl font-bold text-amber-700">{students.filter(s => !s.isSubmitted).length}</span>
                </div>
                  <div className="max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                    {students.filter(s => !s.isSubmitted).map(s => (
                      <div key={s.registrationNumber} className="text-xs p-3 bg-gray-50 rounded-xl flex justify-between items-center group hover:bg-white hover:shadow-sm border border-transparent hover:border-border transition-all">
                        <div className="flex flex-col">
                          <span className="font-bold text-text">{s.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-text-muted font-bold">{s.registrationNumber}</span>
                            <span className="text-[9px] text-primary/60 font-mono">DOB: {s.dob?.length > 20 ? "Hashed" : s.dob}</span>
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[8px] font-bold ${s.group === 'A' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
                          GRP_{s.group}
                        </span>
                      </div>
                    ))}
                  </div>
              </div>
            </div>
          </div>

          {/* Subject Selection Details */}
          <div className="professional-card p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Subject Selection Breakdown</h2>
              <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Detailed Faculty Allocation Report</p>
            </div>
            <div className="space-y-8 sm:space-y-12">
              {subjects.map(subject => (
                <div key={subject.id} className="space-y-6 p-4 sm:p-8 bg-gray-50/50 rounded-3xl border border-border">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-6">
                    <div>
                      <h3 className="text-xl sm:text-2xl font-bold text-primary">{subject.name}</h3>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mt-1">ID: {subject.id}</p>
                    </div>
                    <button 
                      onClick={() => downloadSubjectReport(subject.id)}
                      className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-white hover:bg-gray-50 rounded-xl transition-all text-[10px] font-bold uppercase tracking-widest text-text-muted hover:text-primary border border-border"
                    >
                      <Download size={16} />
                      Export Data
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
                    {/* Group A */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-blue-600">Group A Faculty</h4>
                      </div>
                      <div className="grid grid-cols-1 gap-4">
                        {faculty.filter(f => f.subjectId === subject.id && f.group === 'A').map(f => {
                          const selectedStudents = students.filter(s => s.selections?.[subject.id] === f.id);
                          return (
                            <div key={f.id} className="p-5 bg-white rounded-2xl border border-border hover:shadow-sm transition-shadow">
                              <div className="flex justify-between items-center mb-3">
                                <div className="flex flex-col">
                                  <span className="font-bold text-sm text-text">{f.name}</span>
                                  <span className="text-[9px] font-bold uppercase tracking-widest text-blue-600/60">Section {f.section}</span>
                                </div>
                                <span className="px-3 py-1 bg-blue-50 rounded-full text-[10px] font-bold text-blue-600">{selectedStudents.length} Students</span>
                              </div>
                              <div className="max-h-32 overflow-y-auto text-[10px] space-y-1 custom-scrollbar pr-2">
                                {selectedStudents.map(s => (
                                  <div key={s.registrationNumber} className="flex justify-between text-text-muted hover:text-text transition-colors">
                                    <span>{s.name}</span>
                                    <span className="font-bold">{s.registrationNumber}</span>
                                  </div>
                                ))}
                                {selectedStudents.length === 0 && <span className="text-text-muted/40 italic">No selections yet</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Group B */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-2 h-2 rounded-full bg-purple-500" />
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-purple-600">Group B Faculty</h4>
                      </div>
                      <div className="grid grid-cols-1 gap-4">
                        {faculty.filter(f => f.subjectId === subject.id && f.group === 'B').map(f => {
                          const selectedStudents = students.filter(s => s.selections?.[subject.id] === f.id);
                          return (
                            <div key={f.id} className="p-5 bg-white rounded-2xl border border-border hover:shadow-sm transition-shadow">
                              <div className="flex justify-between items-center mb-3">
                                <div className="flex flex-col">
                                  <span className="font-bold text-sm text-text">{f.name}</span>
                                  <span className="text-[9px] font-bold uppercase tracking-widest text-purple-600/60">Section {f.section}</span>
                                </div>
                                <span className="px-3 py-1 bg-purple-50 rounded-full text-[10px] font-bold text-purple-600">{selectedStudents.length} Students</span>
                              </div>
                              <div className="max-h-32 overflow-y-auto text-[10px] space-y-1 custom-scrollbar pr-2">
                                {selectedStudents.map(s => (
                                  <div key={s.registrationNumber} className="flex justify-between text-text-muted hover:text-text transition-colors">
                                    <span>{s.name}</span>
                                    <span className="font-bold">{s.registrationNumber}</span>
                                  </div>
                                ))}
                                {selectedStudents.length === 0 && <span className="text-text-muted/40 italic">No selections yet</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Student Directory */}
          <div className="professional-card overflow-hidden flex flex-col">
            <div className="p-6 sm:p-8 border-b border-border bg-gray-50/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Entity Directory</h2>
                <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mt-1">Registry Monitoring Service</p>
              </div>
              <div className="relative w-full md:w-72">
                <input
                  type="text"
                  placeholder="Search registry..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input-field pl-12 text-sm"
                />
                <Search className="w-4 h-4 text-text-muted absolute left-4 top-1/2 -translate-y-1/2" />
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border text-[10px] font-bold uppercase tracking-widest text-text-muted bg-gray-50/30">
                    <th className="px-6 sm:px-8 py-4 sm:py-5">Identification No</th>
                    <th className="px-6 sm:px-8 py-4 sm:py-5">Entity Name</th>
                    <th className="px-6 sm:px-8 py-4 sm:py-5">Dept Branch</th>
                    <th className="px-6 sm:px-8 py-4 sm:py-5">Group</th>
                    <th className="px-6 sm:px-8 py-4 sm:py-5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-8 py-24 text-center text-[10px] font-bold uppercase tracking-widest text-text-muted">
                        No Records Found
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.slice(0, 50).map((student) => (
                      <tr key={student.registrationNumber} className="hover:bg-gray-50 transition-colors group">
                        <td className="px-6 sm:px-8 py-4 sm:py-5 text-[11px] font-bold text-text-muted">{student.registrationNumber}</td>
                        <td className="px-6 sm:px-8 py-4 sm:py-5 font-bold text-sm text-text">{student.name}</td>
                        <td className="px-6 sm:px-8 py-4 sm:py-5 text-[10px] font-bold text-text-muted">{student.branch}</td>
                        <td className="px-6 sm:px-8 py-4 sm:py-5">
                          <span className={`px-2 py-0.5 rounded text-[8px] font-bold ${student.group === 'A' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
                            GRP_{student.group}
                          </span>
                        </td>
                        <td className="px-6 sm:px-8 py-4 sm:py-5 text-center">
                          {student.isSubmitted ? (
                            <span className="inline-flex items-center gap-2 px-3 py-1 bg-green-50 text-green-600 rounded-full text-[9px] font-bold uppercase tracking-widest border border-green-100">
                              <div className="w-1 h-1 rounded-full bg-green-500" />
                              Confirmed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-2 px-3 py-1 bg-gray-50 text-text-muted rounded-full text-[9px] font-bold uppercase tracking-widest border border-border">
                              <div className="w-1 h-1 rounded-full bg-gray-300" />
                              Pending
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {filteredStudents.length > 50 && (
              <div className="p-4 border-t border-border bg-gray-50/30 text-center text-[9px] font-bold uppercase tracking-widest text-text-muted">
                Showing first 50 entries. Refine search parameters.
              </div>
            )}
          </div>

          {/* Faculty Monitoring */}
          <div className="professional-card overflow-hidden flex flex-col">
            <div className="p-6 sm:p-8 border-b border-border bg-gray-50/50">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Load Balancer</h2>
              <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mt-1">Faculty Allocation Metrics</p>
            </div>
            
            <div className="p-6 sm:p-8 space-y-4 overflow-y-auto max-h-[650px] custom-scrollbar">
              {faculty.map(f => {
                const liveCount = students.filter(s => s.selections?.[f.subjectId] === f.id).length;
                const isOverloaded = liveCount >= 70;
                
                return (
                  <div key={f.id} className="p-5 rounded-2xl bg-gray-50 border border-border hover:border-primary/30 transition-all group">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="px-1.5 py-0.5 bg-white border border-border rounded text-[8px] font-bold uppercase">Section {f.section}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${f.group === 'A' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>Group {f.group}</span>
                        </div>
                        <p className="font-bold text-sm text-text leading-none mb-2">{f.name}</p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">{subjects.find(s => s.id === f.subjectId)?.name}</p>
                      </div>
                      <div className="text-right">
                        <span className={`font-mono text-[11px] font-bold ${isOverloaded ? "text-red-500" : "text-text-muted"}`}>
                          {liveCount.toString().padStart(2, '0')}/70
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-700 ${isOverloaded ? "bg-red-500" : "bg-primary"}`}
                        style={{ width: `${(liveCount / 70) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="py-12 border-t border-border flex flex-col md:flex-row justify-between items-center gap-6 font-mono text-[10px] font-bold uppercase tracking-widest text-text-muted opacity-60">
          <div className="flex items-center gap-4">
            <span>© 2026 RGMCET_SYS</span>
            <div className="w-1 h-1 rounded-full bg-border" />
            <span>Terminal_ID: {Math.random().toString(36).substring(7).toUpperCase()}</span>
          </div>
          <div className="flex items-center gap-8">
            <span>Latency: 12ms</span>
            <span>V2.0.4_STABLE</span>
          </div>
        </footer>
      </div>

      {/* Reset Confirmation Modal */}
      <AnimatePresence>
        {showResetConfirm && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white p-8 sm:p-12 rounded-[32px] max-w-md w-full text-center relative shadow-2xl border border-border"
            >
              <div className="w-20 h-20 bg-red-50 rounded-[24px] flex items-center justify-center mx-auto mb-8 border border-red-100">
                <AlertCircle size={40} className="text-red-600" />
              </div>
              <h3 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4 text-text">Confirm Purge</h3>
              <p className="text-text-muted mb-12 leading-relaxed text-sm">
                Warning: This operation will purge all student selection buffers and reset load balancers to zero. This action is irreversible.
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 px-6 py-4 rounded-xl font-bold uppercase tracking-widest text-text-muted hover:text-text hover:bg-gray-100 transition-all border border-border"
                >
                  Abort
                </button>
                <button 
                  onClick={resetAll}
                  className="flex-1 px-6 py-4 rounded-xl font-bold uppercase tracking-widest bg-red-600 text-white hover:bg-red-700 transition-all shadow-lg shadow-red-600/20"
                >
                  Execute
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(" ");
}
