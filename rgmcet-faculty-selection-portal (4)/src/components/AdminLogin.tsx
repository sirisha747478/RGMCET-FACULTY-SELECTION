import { useState, useEffect, useCallback } from "react";
import { auth, db } from "../firebase";
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, User } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ShieldCheck, ArrowLeft } from "lucide-react";
import { motion } from "motion/react";
import { OperationType, handleFirestoreError } from "../lib/utils";

export default function AdminLogin() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleAuthResult = useCallback(async (user: User) => {
    // Check if this is the admin
    if (user.email === "sirimajjari7474@gmail.com" && user.emailVerified) {
      // Ensure admin record exists in users collection
      try {
        await setDoc(doc(db, "users", user.uid), {
          uid: user.uid,
          email: user.email,
          role: "admin"
        }, { merge: true });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
        return;
      }
      
      toast.success("Admin Login successful!");
      navigate("/admin");
    } else {
      // Check if user is an admin in Firestore
      const userRef = doc(db, "users", user.uid);
      let userSnap;
      try {
        userSnap = await getDoc(userRef);
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
        return;
      }
      
      if (userSnap.exists() && userSnap.data().role === "admin") {
        toast.success("Admin Login successful!");
        navigate("/admin");
      } else {
        toast.error("Access denied. This portal is for administrators only.");
        await auth.signOut();
      }
    }
  }, [navigate]);

  useEffect(() => {
    const checkRedirect = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result && result.user) {
          setLoading(true);
          await handleAuthResult(result.user);
          setLoading(false);
        }
      } catch (error: any) {
        console.error("Redirect error:", error);
      }
    };
    checkRedirect();
  }, [handleAuthResult]);

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      
      let result;
      try {
        // Attempt popup first as it's a better UX
        result = await signInWithPopup(auth, provider);
      } catch (popupError: any) {
        if (popupError.code === 'auth/popup-blocked') {
          toast.info("Popup blocked. Attempting redirect login...");
          await signInWithRedirect(auth, provider);
          return;
        }
        if (popupError.code === 'auth/popup-closed-by-user') {
          // User closed the popup, no need to show an error toast
          return;
        }
        throw popupError;
      }

      if (result && result.user) {
        setLoading(true);
        await handleAuthResult(result.user);
      }
    } catch (error: any) {
      console.error("Full Firebase Error:", error);
      if (error.code === "auth/admin-restricted-operation") {
        toast.error("Google Authentication is restricted for project: " + auth.app.options.projectId);
      } else if (error.code === 'auth/unauthorized-domain') {
        toast.error("Domain not authorized. Please add 'localhost' to Authorized Domains in Firebase Console.");
      } else {
        toast.error(error.message || "Admin Login failed.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-text flex items-center justify-center p-6 relative overflow-hidden">
      {/* Subtle Background Elements */}
      <div className="absolute top-[-10%] right-[-5%] w-[40%] h-[40%] bg-primary/5 blur-[100px] rounded-full" />
      <div className="absolute bottom-[-10%] left-[-5%] w-[40%] h-[40%] bg-blue-500/5 blur-[100px] rounded-full" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full professional-card p-10 rounded-3xl relative z-10"
      >
        <button 
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-text-muted hover:text-primary transition-colors mb-10 group"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Back to Home</span>
        </button>

        <div className="flex items-center gap-6 mb-10">
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center overflow-hidden shadow-sm border border-border">
            <img 
              src="https://rgmcet.edu.in/assets/img/logo/logo.jpg" 
              alt="RGMCET Logo" 
              className="w-12 h-12 object-contain"
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "https://picsum.photos/seed/college/100/100";
              }}
            />
          </div>
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-primary mb-1">RGMCET</h1>
            <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Admin Command Center</p>
          </div>
        </div>

        <div className="space-y-6">
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-4 bg-white border border-border text-text py-4 rounded-xl font-bold uppercase tracking-widest hover:bg-gray-50 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
            {loading ? "Verifying..." : "Sign in with Google"}
          </button>
          
          <div className="p-5 border border-border rounded-xl bg-gray-50/50">
            <p className="text-[10px] font-bold uppercase tracking-widest text-center leading-relaxed text-text-muted/70">
              Warning: Unauthorized access attempts are logged and reported to the security department.
            </p>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-border flex justify-between items-center text-[8px] font-bold uppercase tracking-widest text-text-muted/40">
          <span>© 2026 RGMCET_SYS</span>
          <span>PID: {auth.app.options.projectId?.slice(0, 8)}</span>
        </div>
      </motion.div>
    </div>
  );
}
