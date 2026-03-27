import { useNavigate } from "react-router-dom";
import { GraduationCap, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-text relative overflow-hidden flex flex-col">
      {/* Immersive Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-blue-500/5 blur-[100px] rounded-full" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full opacity-5 pointer-events-none" 
           style={{ backgroundImage: "radial-gradient(circle at center, #000 1px, transparent 1px)", backgroundSize: "40px 40px" }} />

      {/* Navigation */}
      <nav className="flex justify-between items-center p-8 lg:px-24 relative z-10">
        <div className="flex items-center gap-6">
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
            <h1 className="text-4xl font-bold tracking-tight text-primary">RGMCET</h1>
            <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-text-muted">Secure Faculty Selection</p>
          </div>
        </div>
      </nav>

      <main className="flex-1 flex flex-col lg:flex-row items-center justify-center p-8 lg:p-24 gap-16 relative z-10">
        <div className="flex-1 space-y-8 text-center lg:text-left">
          <div className="inline-flex items-center gap-3 px-4 py-2 bg-white border border-border rounded-full shadow-sm">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-text-muted">System V2.0.4 Stable</span>
          </div>
          
          <h1 className="text-6xl lg:text-[100px] leading-[0.9] tracking-tighter font-bold text-text">
            Faculty<br />
            <span className="text-primary">Selection</span>
          </h1>
          
          <p className="max-w-md text-lg text-text-muted font-medium leading-relaxed">
            A premium interface for academic resource allocation. 
            Seamlessly connecting students with distinguished faculty members.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-6 w-full lg:w-auto">
          {/* Student Portal Card */}
          <motion.div
            whileHover={{ scale: 1.02, translateY: -5 }}
            onClick={() => navigate("/student/login")}
            className="professional-card p-10 rounded-[40px] w-full sm:w-[320px] cursor-pointer group relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full -mr-8 -mt-8 group-hover:bg-primary/10 transition-colors" />
            <div className="relative z-10">
              <div className="w-16 h-16 bg-primary/5 rounded-2xl flex items-center justify-center mb-8 group-hover:bg-primary/10 transition-all">
                <GraduationCap size={32} className="text-primary" />
              </div>
              <h3 className="text-2xl font-bold mb-2 text-text">Student Portal</h3>
              <p className="text-sm text-text-muted mb-8">Initialize your academic journey and select your mentors.</p>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-primary">
                <span>Enter Session</span>
                <div className="h-px flex-1 bg-primary/20" />
              </div>
            </div>
          </motion.div>

          {/* Admin Portal Card */}
          <motion.div
            whileHover={{ scale: 1.02, translateY: -5 }}
            onClick={() => navigate("/admin/login")}
            className="professional-card p-10 rounded-[40px] w-full sm:w-[320px] cursor-pointer group relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-gray-50 rounded-bl-full -mr-8 -mt-8 group-hover:bg-gray-100 transition-colors" />
            <div className="relative z-10">
              <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mb-8 group-hover:bg-gray-100 transition-all">
                <ShieldCheck size={32} className="text-text-muted" />
              </div>
              <h3 className="text-2xl font-bold mb-2 text-text">Admin Access</h3>
              <p className="text-sm text-text-muted mb-8">Elevated controls for system monitoring and management.</p>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-text-muted/40">
                <span>Authenticate</span>
                <div className="h-px flex-1 bg-border" />
              </div>
            </div>
          </motion.div>
        </div>
      </main>

      <footer className="p-8 lg:px-24 border-t border-border flex flex-col sm:flex-row justify-between items-center gap-4 relative z-10">
        <div className="flex items-center gap-6 text-[10px] font-bold uppercase tracking-widest text-text-muted/40">
          <span>© 2026 RGMCET System</span>
          <div className="w-1 h-1 rounded-full bg-border" />
          <span>Encrypted Connection</span>
        </div>
        <div className="flex items-center gap-8 text-[10px] font-bold uppercase tracking-widest text-text-muted/40">
          <span className="hover:text-primary cursor-pointer transition-colors">Privacy Protocol</span>
          <span className="hover:text-primary cursor-pointer transition-colors">System Status</span>
        </div>
      </footer>
    </div>
  );
}
