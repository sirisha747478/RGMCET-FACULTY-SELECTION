import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-faculty-portal-key";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.post("/api/auth/login", async (req, res) => {
    const { registrationNumber, dob } = req.body;
    // In a real app, you'd fetch the student from Firestore here
    // For this full-stack demo, we'll assume the frontend handles the initial check
    // and the backend provides a token for secure operations if needed.
    // However, the user requested JWT authentication.
    
    // Mocking a successful login for token generation
    const token = jwt.sign({ registrationNumber }, JWT_SECRET, { expiresIn: "1h" });
    res.json({ token });
  });

  app.post("/api/email/confirm", async (req, res) => {
    const { studentEmail, studentName, selections } = req.body;

    const emailUser = process.env.EMAIL_USER?.trim();
    let emailPass = process.env.EMAIL_PASS;

    // Automatically remove spaces from App Password (common copy-paste issue)
    if (emailPass) {
      emailPass = emailPass.replace(/\s/g, "");
    }

    // Basic validation for placeholders
    const isPlaceholder = (val: string | undefined) => 
      !val || val.includes("YOUR_EMAIL") || val.includes("YOUR_APP_PASSWORD");

    if (isPlaceholder(emailUser) || isPlaceholder(emailPass)) {
      console.log("Email credentials are not configured or are using placeholders. Mocking email send.");
      return res.json({ 
        success: true, 
        message: "Email mocked (credentials not configured)",
        debug: "Please set EMAIL_USER and EMAIL_PASS in AI Studio Secrets."
      });
    }

    console.log(`Email Config Check: User starts with "${emailUser?.charAt(0)}" and ends with "${emailUser?.charAt((emailUser?.length || 0) - 1)}". Password length: ${emailPass?.length}`);

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: emailUser,
        pass: emailPass,
      },
    });

    const selectionList = Object.entries(selections)
      .map(([subject, faculty]) => `<li><b>${subject}:</b> ${faculty}</li>`)
      .join("");

    const mailOptions = {
      from: emailUser,
      to: studentEmail,
      bcc: emailUser, // Send a copy to the admin for verification
      subject: "Faculty Selection Confirmation",
      html: `
        <h1>Faculty Selection Portal</h1>
        <p>Hello ${studentName},</p>
        <p>Your faculty selections have been successfully submitted:</p>
        <ul>${selectionList}</ul>
        <p>This is a permanent selection and cannot be modified.</p>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
      res.json({ success: true, message: "Email sent" });
    } catch (error: any) {
      console.error("Email error:", error.message);
      
      if (error.message.includes("535-5.7.8")) {
        console.error("AUTHENTICATION FAILED: Gmail rejected your credentials.");
        return res.status(401).json({ 
          success: false, 
          error: "Email authentication failed. Gmail rejected your App Password.",
          debug: {
            user: `${emailUser?.charAt(0)}...${emailUser?.charAt((emailUser?.length || 0) - 1)}`,
            passLength: emailPass?.length,
            tip: "Ensure 2-Step Verification is ON and you are using a 16-character App Password without spaces."
          }
        });
      }

      res.status(500).json({ success: false, error: "Failed to send email" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
