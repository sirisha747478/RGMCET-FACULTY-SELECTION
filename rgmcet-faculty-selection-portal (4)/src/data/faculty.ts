export interface FacultyData {
  id: string;
  name: string;
  subjectId: string;
  group: 'A' | 'B';
  section: 'A1' | 'A2' | 'A3' | 'A4';
}

export const facultyData: FacultyData[] = [
  // Group A (A1/A2)
  { id: "ML_A1", name: "Dr. Rajaboina Raja Kumar", subjectId: "ML", group: "A", section: "A1" },
  { id: "ML_A2", name: "Dr.P. Sreedevi", subjectId: "ML", group: "A", section: "A2" },
  { id: "CC_A1", name: "Mr. P. Naveen Sundeer Kumar", subjectId: "CC", group: "A", section: "A1" },
  { id: "CC_A2", name: "Dr. P. Nagaraju", subjectId: "CC", group: "A", section: "A2" },
  { id: "CNS_A1", name: "Dr.G. Sunil Vijay Kumar", subjectId: "CNS", group: "A", section: "A1" },
  { id: "CNS_A2", name: "Dr. S Subba Lakshmi", subjectId: "CNS", group: "A", section: "A2" },
  { id: "CS_A1", name: "Dr. C. Ramakrishnaiah", subjectId: "CS", group: "A", section: "A1" },
  { id: "CS_A2", name: "Dr.N Madhusudhana Reddy", subjectId: "CS", group: "A", section: "A2" },
  { id: "CG_A1", name: "Dr. K. Narasimhulu", subjectId: "CG", group: "A", section: "A1" },
  { id: "CG_A2", name: "Mr. G. Rajasekhar Reddy", subjectId: "CG", group: "A", section: "A2" },
  { id: "TPW_A1", name: "Dr.O. Sampath", subjectId: "TPW", group: "A", section: "A1" },
  { id: "TPW_A2", name: "Mr. B. Rameswara Reddy", subjectId: "TPW", group: "A", section: "A2" },
  { id: "AWPS_A1", name: "Dr.P.Kousar Basha", subjectId: "AWPS", group: "A", section: "A1" },
  { id: "AWPS_A2", name: "Dr.C.Sankar Goud", subjectId: "AWPS", group: "A", section: "A2" },

  // Group B (A3/A4)
  { id: "ML_A3", name: "Dr.K.Nageswara Reddy", subjectId: "ML", group: "B", section: "A3" },
  { id: "ML_A4", name: "Dr. Rajaboina Raja Kumar", subjectId: "ML", group: "B", section: "A4" },
  { id: "CC_A3", name: "Mrs. S Rubiya Parveen", subjectId: "CC", group: "B", section: "A3" },
  { id: "CC_A4", name: "Dr. M .Ayyavaraiah", subjectId: "CC", group: "B", section: "A4" },
  { id: "CNS_A3", name: "Dr.G. Sunil Vijay Kumar", subjectId: "CNS", group: "B", section: "A3" },
  { id: "CNS_A4", name: "Dr.S Subba Lakshmi", subjectId: "CNS", group: "B", section: "A4" },
  { id: "CS_A3", name: "Dr.M. Sravan Kumar Reddy", subjectId: "CS", group: "B", section: "A3" },
  { id: "CS_A4", name: "Dr.N Madhusudhana Reddy", subjectId: "CS", group: "B", section: "A4" },
  { id: "CG_A3", name: "Dr.K.Narasimhulu", subjectId: "CG", group: "B", section: "A3" },
  { id: "CG_A4", name: "Mr.G Rajasekhar Reddy", subjectId: "CG", group: "B", section: "A4" },
  { id: "TPW_A3", name: "Dr.O. Sampath", subjectId: "TPW", group: "B", section: "A3" },
  { id: "TPW_A4", name: "Mr. B. Rameswara Reddy", subjectId: "TPW", group: "B", section: "A4" },
  { id: "AWPS_A3", name: "Dr.G Kiran Kumar Reddy", subjectId: "AWPS", group: "B", section: "A3" },
  { id: "AWPS_A4", name: "Mrs. M. Aparna", subjectId: "AWPS", group: "B", section: "A4" }
];

export const subjectsData = [
  { id: "ML", name: "Machine Learning" },
  { id: "CC", name: "Cloud Computing" },
  { id: "CNS", name: "Cryptography and Network Security" },
  { id: "CS", name: "Cyber Security" },
  { id: "CG", name: "Computer Graphics" },
  { id: "TPW", name: "Technical paper writing" },
  { id: "AWPS", name: "Academic writing and Public speaking" }
];
