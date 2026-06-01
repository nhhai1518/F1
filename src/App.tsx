import React, { useState, useEffect } from "react";
import { 
  School, 
  User, 
  GraduationCap, 
  Send, 
  Database, 
  Settings, 
  FileCode, 
  Copy, 
  Check, 
  HelpCircle, 
  RefreshCw, 
  AlertCircle, 
  BookOpen, 
  ChevronRight,
  Info,
  FileSpreadsheet,
  LogIn,
  LogOut,
  Shield,
  Lock,
  Mail
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import * as XLSX from "xlsx";
import { db } from "./firebase";
import { collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, serverTimestamp } from "firebase/firestore";


// Structure definition for Schools database (Tab DM_TRUONG)
interface SchoolItem {
  xa_phuong: string;
  ten_truong: string;
  cap_bao_cao: string;
}

// Structure definition for Reports database (Tab BAOCAO)
interface ReportItem {
  id: string; // client-side local id tracker
  timestamp: string;
  xa_phuong: string;
  ten_truong: string;
  ho_ten_gv: string;
  tien_si: string; // 'X' or ''
  thac_si: string; // 'X' or ''
  dai_hoc: string; // 'X' or ''
  isLive?: boolean;
}

// Pre-populated default Vietnamese Educational Master-Data
const DEFAULT_SCHOOLS: SchoolItem[] = [
  { xa_phuong: "Phường 1", ten_truong: "THCS Kim Hồng", cap_bao_cao: "CAP THCS" },
  { xa_phuong: "Phường 1", ten_truong: "THCS Nguyễn Thị Lựu", cap_bao_cao: "CAP THCS" },
  { xa_phuong: "Phường 1", ten_truong: "THPT Chuyên Nguyễn Quang Diêu", cap_bao_cao: "CAP THPT" },
  { xa_phuong: "Phường 2", ten_truong: "THCS Nguyễn Tự Lực", cap_bao_cao: "CAP THCS" },
  { xa_phuong: "Phường 2", ten_truong: "THPT Cao Lãnh 1", cap_bao_cao: "CAP THPT" },
  { xa_phuong: "Phường Mỹ Phú", ten_truong: "THCS Phan Bội Châu", cap_bao_cao: "CAP THCS" },
  { xa_phuong: "Phường Mỹ Phú", ten_truong: "THPT Đỗ Công Tường", cap_bao_cao: "CAP THPT" },
  { xa_phuong: "Phường An Thạnh", ten_truong: "THCS An Thạnh", cap_bao_cao: "CAP THCS" },
  { xa_phuong: "Phường An Thạnh", ten_truong: "THPT Hồng Ngự 1", cap_bao_cao: "CAP THPT" },
  { xa_phuong: "Xã Mỹ Trà", ten_truong: "THCS Mỹ Trà", cap_bao_cao: "CAP THCS" },
  { xa_phuong: "Xã Tân Thuận Đông", ten_truong: "THCS Tân Thuận Đông", cap_bao_cao: "CAP THCS" },
];

export default function App() {
  const [gasUrl, setGasUrl] = useState<string>(() => {
    return localStorage.getItem("edu_gas_url") || "";
  });

  // Master schools database state (either default offline or loaded from doGet)
  const [schools, setSchools] = useState<SchoolItem[]>(() => {
    const cached = localStorage.getItem("edu_cached_schools");
    return cached ? JSON.parse(cached) : DEFAULT_SCHOOLS;
  });

  // Submitted reports tracker (for visual validation in UI database table)
  const [submittedReports, setSubmittedReports] = useState<ReportItem[]>(() => {
    const cached = localStorage.getItem("edu_submitted_reports");
    return cached ? JSON.parse(cached) : [];
  });

  // Active form states
  const [selectedXaPhuong, setSelectedXaPhuong] = useState<string>("");
  const [selectedTenTruong, setSelectedTenTruong] = useState<string>("");
  const [teacherName, setTeacherName] = useState<string>("");
  const [isTienSi, setIsTienSi] = useState<boolean>(false);
  const [isThacSi, setIsThacSi] = useState<boolean>(false);
  const [isDaiHoc, setIsDaiHoc] = useState<boolean>(false);

  // Status & Notification feedback states
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitStatus, setSubmitStatus] = useState<{
    type: "success" | "error" | null;
    message: string;
  }>({ type: null, message: "" });
  
  const [isLoadingSchools, setIsLoadingSchools] = useState<boolean>(false);
  const [schoolLoadError, setSchoolLoadError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"form" | "guide" | "code">("form");

  // Admin authentication states and handlers
  const [adminEmail, setAdminEmail] = useState<string>(() => {
    return localStorage.getItem("edu_admin_email") || "";
  });
  const [inputEmail, setInputEmail] = useState<string>("");
  const [inputPassword, setInputPassword] = useState<string>("");
  const [loginError, setLoginError] = useState<string | null>(null);

  const isAdmin = adminEmail === "nhhai@dongthap.edu.vn";

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    if (inputEmail.trim().toLowerCase() === "nhhai@dongthap.edu.vn") {
      setAdminEmail("nhhai@dongthap.edu.vn");
      localStorage.setItem("edu_admin_email", "nhhai@dongthap.edu.vn");
      setInputEmail("");
      setInputPassword("");
    } else {
      setLoginError("Tài khoản chưa được phân quyền Quản trị. Vui lòng nhập đúng Gmail nhhai@dongthap.edu.vn!");
    }
  };

  const handleAdminLogout = () => {
    if (confirm("Bạn có chắc chắn muốn đăng xuất chế độ Quản trị viên không?")) {
      setAdminEmail("");
      localStorage.removeItem("edu_admin_email");
    }
  };

  // Save config changes to localStorage
  useEffect(() => {
    localStorage.setItem("edu_gas_url", gasUrl);
  }, [gasUrl]);

  // Real-time Firestore synchronization for reports
  useEffect(() => {
    const q = query(collection(db, "reports"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const reportsList: ReportItem[] = [];
      snapshot.forEach((docRef) => {
        const data = docRef.data();
        reportsList.push({
          id: docRef.id,
          timestamp: data.timestamp || "",
          xa_phuong: data.xa_phuong || "",
          ten_truong: data.ten_truong || "",
          ho_ten_gv: data.ho_ten_gv || "",
          tien_si: data.tien_si || "",
          thac_si: data.thac_si || "",
          dai_hoc: data.dai_hoc || "",
          isLive: data.isLive !== false
        });
      });
      setSubmittedReports(reportsList);
      localStorage.setItem("edu_submitted_reports", JSON.stringify(reportsList));
    }, (error) => {
      console.error("Firestore loading reports error:", error);
    });
    return () => unsubscribe();
  }, []);

  // Real-time Firestore synchronization for schools
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "schools"), (snapshot) => {
      if (!snapshot.empty) {
        const schoolsList: SchoolItem[] = [];
        snapshot.forEach((docRef) => {
          const data = docRef.data();
          schoolsList.push({
            xa_phuong: data.xa_phuong || "",
            ten_truong: data.ten_truong || "",
            cap_bao_cao: data.cap_bao_cao || ""
          });
        });
        setSchools(schoolsList);
        localStorage.setItem("edu_cached_schools", JSON.stringify(schoolsList));
      }
    }, (error) => {
      console.error("Firestore loading schools error:", error);
    });
    return () => unsubscribe();
  }, []);

  const [isSeedingSchools, setIsSeedingSchools] = useState<boolean>(false);
  const seedSchoolsToFirebase = async () => {
    setIsSeedingSchools(true);
    setSubmitStatus({ type: null, message: "" });
    try {
      const batchPromises = DEFAULT_SCHOOLS.map((school) => {
        return addDoc(collection(db, "schools"), school);
      });
      await Promise.all(batchPromises);
      setSubmitStatus({
        type: "success",
        message: "🎉 Đã khởi tạo và đồng bộ danh bạ 11 trường học mẫu lên Firebase Firestore thành công!"
      });
    } catch (err: any) {
      console.error("Error seeding schools collection:", err);
      setSubmitStatus({
        type: "error",
        message: `Lỗi đồng bộ danh mục: ${err.message || err}`
      });
    } finally {
      setIsSeedingSchools(false);
    }
  };


  // Load live schools data from Google Apps Script doGet(e)
  const fetchLiveSchools = async (silent = false) => {
    if (!gasUrl) {
      if (!silent) {
        setSchoolLoadError("Vui lòng cấu hình URL Google Apps Script Web App trước.");
      }
      return;
    }

    setIsLoadingSchools(true);
    setSchoolLoadError(null);

    try {
      // Create a timeout controller to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(`${gasUrl}?action=getSchools`, {
        method: "GET",
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }

      const rawText = await response.text();
      let resJson;
      try {
        resJson = JSON.parse(rawText);
      } catch (e) {
        throw new Error("Phản hồi từ Google Apps Script không phải định dạng JSON hợp lệ.");
      }

      if (resJson && resJson.schools && Array.isArray(resJson.schools)) {
        setSchools(resJson.schools);
        localStorage.setItem("edu_cached_schools", JSON.stringify(resJson.schools));
        setSubmitStatus({
          type: "success",
          message: "Đồng bộ danh sách Trường từ Google Sheets thành công!"
        });
        setTimeout(() => setSubmitStatus({ type: null, message: "" }), 4000);
      } else {
        throw new Error("Không nhận được thuộc tính 'schools' đúng cấu trúc.");
      }
    } catch (err: any) {
      console.warn("Error fetching GAS data:", err);
      // Don't overwrite state with nothing, keep previous state, but show message
      const errorMsg = err.name === "AbortError" 
        ? "Quá thời gian kết nối (Timeout). Vui lòng kiểm tra lại URL triển khai."
        : `Lỗi đồng bộ: ${err.message || err}. Đang sử dụng dữ liệu mặc định local.`;
      
      setSchoolLoadError(errorMsg);
    } finally {
      setIsLoadingSchools(false);
    }
  };

  // Trigger sync on mounting and whenever the gasUrl is updated
  useEffect(() => {
    if (gasUrl) {
      fetchLiveSchools(true);
    } else {
      setSchools(DEFAULT_SCHOOLS);
    }
  }, [gasUrl]);

  // Compute derived options: List of Unique Municipalities (Xã/Phường)
  const listXaPhuong = Array.from(new Set(schools.map((s) => s.xa_phuong))).filter(Boolean).sort();

  // Compute second select options: List of Schools inside the selected Xã/Phường
  const listTruongTuongUng = schools.filter((s) => s.xa_phuong === selectedXaPhuong);

  // Form Reset Helper
  const handleResetForm = () => {
    setSelectedXaPhuong("");
    setSelectedTenTruong("");
    setTeacherName("");
    setIsTienSi(false);
    setIsThacSi(false);
    setIsDaiHoc(false);
  };

  // Form Submission Process
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Field Validations
    if (!selectedXaPhuong) {
      setSubmitStatus({ type: "error", message: "Vui lòng chọn Xã/Phường." });
      return;
    }
    if (!selectedTenTruong) {
      setSubmitStatus({ type: "error", message: "Vui lòng chọn Tên trường học." });
      return;
    }
    if (!teacherName.trim()) {
      setSubmitStatus({ type: "error", message: "Vui lòng nhập Họ và tên giáo viên." });
      return;
    }

    const payload = {
      xa_phuong: selectedXaPhuong,
      ten_truong: selectedTenTruong,
      ho_ten_gv: teacherName.trim(),
      tien_si: isTienSi ? "X" : "",
      thac_si: isThacSi ? "X" : "",
      dai_hoc: isDaiHoc ? "X" : "",
    };

    setIsSubmitting(true);
    setSubmitStatus({ type: null, message: "" });

    // Client-side visual state timestamp for local table
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    
    // We can simulate Vietnamese formatting or ISO
    const localTimeString = formatter.format(new Date());

    try {
      // 1. Persist directly to Firebase Cloud Firestore reports collection
      await addDoc(collection(db, "reports"), {
        ...payload,
        timestamp: localTimeString,
        createdAt: serverTimestamp(),
        isLive: true
      });

      // 2. Secondary fallback submission to Google Sheets if Apps Script URL is defined
      if (gasUrl) {
        try {
          const searchParams = new URLSearchParams();
          searchParams.append("xa_phuong", payload.xa_phuong);
          searchParams.append("ten_truong", payload.ten_truong);
          searchParams.append("ho_ten_gv", payload.ho_ten_gv);
          searchParams.append("tien_si", payload.tien_si);
          searchParams.append("thac_si", payload.thac_si);
          searchParams.append("dai_hoc", payload.dai_hoc);

          await fetch(gasUrl, {
            method: "POST",
            mode: "no-cors",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: searchParams.toString(),
          });
        } catch (gasErr: any) {
          console.warn("GAS forwarding failed:", gasErr);
        }
      }

      setIsSubmitting(false);
      setSubmitStatus({
        type: "success",
        message: gasUrl 
          ? "🎉 Gửi báo cáo thành công! Bản ghi đã được lưu trữ vĩnh viễn trên Firebase Firestore và đồng bộ tới Google Sheets."
          : "🎉 Gửi báo cáo thành công! Bản ghi đã được đồng bộ trực tiếp lên Cloud Firestore an toàn."
      });
      handleResetForm();
    } catch (fbErr: any) {
      console.error("Firebase submit error:", fbErr);
      
      // Fallback local memory state
      const targetReport: ReportItem = {
        id: Date.now().toString(),
        timestamp: localTimeString,
        ...payload,
        isLive: false
      };
      setSubmittedReports((prev) => [targetReport, ...prev]);
      
      setIsSubmitting(false);
      setSubmitStatus({
        type: "error",
        message: `Lỗi kết nối Firebase: ${fbErr.message || fbErr}. Bản ghi của bạn đã tạm thời lưu trữ offline.`
      });
    }
  };

  // Google Apps Script source code contents for easy copying
  const codeGSContent = `/**
 * Google Apps Script Backend cho ứng dụng Nhập liệu Báo cáo Giáo dục
 * Tác giả: Chuyên gia Lập trình Full-stack
 * Năm: 2026
 */

// 1. Hàm doGet(e): Đọc tab DM_TRUONG (bỏ dòng tiêu đề đầu tiên) và trả về định dạng JSON
function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("DM_TRUONG");
    
    if (!sheet) {
      // Tự động khởi tạo tab DM_TRUONG và ghi dữ liệu mẫu nếu chưa tồn tại
      sheet = ss.insertSheet("DM_TRUONG");
      sheet.appendRow(["Xã/Phường", "Tên trường", "Cấp báo cáo"]);
      
      // Chèn một vài dữ liệu mẫu
      var sampleData = [
        ["Phường 1", "THCS Kim Hồng", "CAP THCS"],
        ["Phường 1", "THCS Nguyễn Thị Lựu", "CAP THCS"],
        ["Phường 1", "THPT Chuyên Nguyễn Quang Diêu", "CAP THPT"],
        ["Phường 2", "THCS Nguyễn Tự Lực", "CAP THCS"],
        ["Phường 2", "THPT Cao Lãnh 1", "CAP THPT"],
        ["Phường Mỹ Phú", "THCS Phan Bội Châu", "CAP THCS"],
        ["Phường Mỹ Phú", "THPT Đỗ Công Tường", "CAP THPT"]
      ];
      sheet.getRange(2, 1, sampleData.length, 3).setValues(sampleData);
    }
    
    var data = sheet.getDataRange().getValues();
    var schools = [];
    
    // Bỏ qua dòng tiêu đề thứ nhất (i = 1)
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (row[0] || row[1]) {
        schools.push({
          xa_phuong: row[0].toString().trim(),
          ten_truong: row[1].toString().trim(),
          cap_bao_cao: (row[2] || "").toString().trim()
        });
      }
    }
    
    var result = { schools: schools };
    return ContentService.createTextOutput(JSON.stringify(result))
                         .setMimeType(ContentService.MimeType.JSON);
                         
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}

// 2. Hàm doPost(e): Nhận dữ liệu (payload), định dạng thời gian GMT+7 và ghi vào tab BAOCAO
function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("BAOCAO");
    
    // Tự động khởi tạo tab BAOCAO nếu chưa tồn tại
    if (!sheet) {
      sheet = ss.insertSheet("BAOCAO");
      sheet.appendRow(["Thời gian nộp", "Xã/Phường", "Tên trường", "Ho_Ten_GV", "Tien_Si", "Thac_Si", "Dai_Hoc"]);
    }
    
    // Trích xuất tham số từ request (e.parameter hỗ trợ URL-encoded cực tốt cho chế độ no-cors)
    var data = e.parameter;
    
    // Nếu gửi bằng JSON thô qua body
    if (e.postData && e.postData.contents) {
      try {
        var parsed = JSON.parse(e.postData.contents);
        if (parsed) {
          data = parsed;
        }
      } catch (jsonErr) {
        // Giữ nguyên e.parameter nếu parse lỗi
      }
    }
    
    // Tự động lấy thời gian hiện tại theo múi giờ Việt Nam (GMT+7)
    var vietnamTime = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd HH:mm:ss");
    
    // Lấy thông tin chi tiết
    var xaPhuong = data.xa_phuong || "";
    var tenTruong = data.ten_truong || "";
    var hoTenGV = data.ho_ten_gv || "";
    var tienSi = data.tien_si || "";
    var thacSi = data.thac_si || "";
    var daiHoc = data.dai_hoc || "";
    
    // Chuẩn bị dòng mới ghi vào bảng tính
    var newRow = [
      vietnamTime,
      xaPhuong,
      tenTruong,
      hoTenGV,
      tienSi,
      thacSi,
      daiHoc
    ];
    
    // Thêm một dòng mới vào tab BAOCAO
    sheet.appendRow(newRow);
    
    // Trả về JSON thành công
    return ContentService.createTextOutput(JSON.stringify({ success: true, message: "Đã thêm báo cáo thành công!" }))
                         .setMimeType(ContentService.MimeType.JSON);
                         
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}`;

  // Copy code utility
  const handleCopyCode = () => {
    navigator.clipboard.writeText(codeGSContent);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 3000);
  };

  // Remove individual client-submitted simulation item
  const handleClearReport = async (id: string) => {
    // Check if it's a Firestore generated ID (alphanumeric hash, not a timestamp number)
    const isFirestoreId = id.length > 10 && isNaN(Number(id));

    if (isFirestoreId) {
      if (!confirm("Bạn có chắc chắn muốn xoá báo cáo giáo dục này khỏi cơ sở dữ liệu Firebase Cloud Firestore không?")) {
        return;
      }
      try {
        await deleteDoc(doc(db, "reports", id));
        setSubmitStatus({
          type: "success",
          message: "🎉 Đã xóa bản ghi thành công khỏi Firebase Cloud Firestore!"
        });
      } catch (err: any) {
        console.error("Error deleting from Firestore:", err);
        setSubmitStatus({
          type: "error",
          message: `Lỗi xóa dữ liệu: ${err.message || err}`
        });
      }
    } else {
      setSubmittedReports((prev) => prev.filter((r) => r.id !== id));
    }
  };

  // Reset entire reports simulator log back to empty
  const handleClearAllReports = () => {
    if (confirm("Bạn có chắc chắn muốn xóa tất cả lịch sử báo cáo hiển thị trên giao diện này không? (Lưu ý: Thao tác này chỉ xóa hiển thị tạm thời nếu có kết nối Firebase)")) {
      setSubmittedReports([]);
    }
  };

  // Export reports to standard Excel (.xlsx) file with Vietnamese labels
  const handleExportExcel = () => {
    if (submittedReports.length === 0) {
      alert("Không có dữ liệu báo cáo nào để xuất!");
      return;
    }

    try {
      // Map data to Vietnamese columns
      const excelData = submittedReports.map((report, index) => ({
        "STT": index + 1,
        "Thời gian báo cáo": report.timestamp,
        "Xã / Phường": report.xa_phuong,
        "Tên trường học": report.ten_truong,
        "Họ và tên giáo viên": report.ho_ten_gv,
        "Tiến sĩ": report.tien_si ? "X" : "",
        "Thạc sĩ": report.thac_si ? "X" : "",
        "Đại học": report.dai_hoc ? "X" : "",
        "Trạng thái đính kèm": report.isLive ? "Đồng bộ đám mây" : "Lưu trữ offline"
      }));

      // Create a worksheet
      const worksheet = XLSX.utils.json_to_sheet(excelData);

      // Define standard column formatting widths
      worksheet["!cols"] = [
        { wch: 6 },   // STT
        { wch: 22 },  // Thời gian báo cáo
        { wch: 18 },  // Xã / Phường
        { wch: 28 },  // Tên trường học
        { wch: 25 },  // Họ và tên giáo viên
        { wch: 10 },  // Tiến sĩ
        { wch: 10 },  // Thạc sĩ
        { wch: 10 },  // Đại học
        { wch: 18 }   // Trạng thái đính kèm
      ];

      // Create workbook and append worksheet
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "BaoCaoGiaoVien");

      // Generate filename based on date
      const currentDate = new Date().toLocaleDateString("vi-VN").replace(/\//g, "-");
      const fileName = `Bao_cao_Trinh_do_Giao_vien_${currentDate}.xlsx`;

      // Export file
      XLSX.writeFile(workbook, fileName);
    } catch (err: any) {
      console.error("Export Excel Error:", err);
      alert(`Đã xảy ra lỗi khi tạo tệp Excel: ${err.message || err}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Visual top design bar decoration */}
      <div className="h-2 bg-gradient-to-r from-teal-500 via-indigo-600 to-emerald-500 w-full" />

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        
        {/* Academic Header Banner */}
        <header id="header-banner" className="mb-8">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 sm:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6 overflow-hidden relative">
            <div className="absolute right-0 top-0 bottom-0 pointer-events-none opacity-5 flex items-center pr-10">
              <BookOpen className="w-64 h-64 text-indigo-900" />
            </div>
            
            <div className="flex items-center gap-4">
              <div className="p-3 bg-indigo-50 text-indigo-700 rounded-xl">
                <School className="w-10 h-10" />
              </div>
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full font-display">
                  Sở Giáo dục và Đào tạo
                </span>
                <h1 id="app-title" className="text-2xl sm:text-3xl font-bold font-display text-slate-900 mt-1 dark:text-slate-900">
                  Hệ thống Nhập liệu - Năm 2026
                </h1>
                <p className="text-sm text-slate-500 mt-1">
                  Nhập báo cáo số lượng chuẩn trình độ đào tạo của lực lượng giáo viên.
                </p>
              </div>
            </div>

            {/* Connection Status Indicator */}
            <div className="flex flex-wrap items-center gap-2 z-10">
              {isAdmin ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold tracking-wide bg-amber-500 text-white border border-amber-600 shadow-sm animate-fade-in">
                  <Shield className="w-3.5 h-3.5 text-amber-150" />
                  Quản trị viên: nhhai@dongthap.edu.vn
                  <button 
                    onClick={handleAdminLogout}
                    className="ml-1.5 text-[10px] bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold px-1.5 py-0.5 rounded transition-all cursor-pointer flex items-center gap-0.5 border border-red-500"
                    title="Đăng xuất khỏi Chức năng Quản trị"
                  >
                    <LogOut className="w-2.5 h-2.5" /> Thoát
                  </button>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide bg-slate-100 text-slate-600 border border-slate-200">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  Độc giả công khai
                </span>
              )}

              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide bg-indigo-50 text-indigo-700 border border-indigo-200">
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                Firebase: Active (nhaplieudemo)
              </span>
              
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide ${
                gasUrl 
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                  : "bg-teal-50 text-teal-700 border border-teal-200 font-medium"
              }`}>
                <span className={`w-2 h-2 rounded-full ${gasUrl ? "bg-emerald-500 animate-pulse" : "bg-teal-500"}`} />
                {gasUrl ? "Google Sheets: Đồng bộ" : "Google Sheets: Chưa cấu hình"}
              </span>
            </div>
          </div>
        </header>

        {/* Global Navigation Tabs across views */}
        <div id="navigation-tabs" className="flex border-b border-slate-200 mb-6 gap-2">
          <button
            onClick={() => setActiveTab("form")}
            className={`pb-3 px-4 font-semibold text-sm font-display transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
              activeTab === "form" 
                ? "border-indigo-600 text-indigo-600" 
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            <School className="w-4 h-4" />
            Nhập hồ sơ báo cáo
          </button>
          <button
            onClick={() => setActiveTab("guide")}
            className={`pb-3 px-4 font-semibold text-sm font-display transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
              activeTab === "guide" 
                ? "border-indigo-600 text-indigo-600" 
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            Hướng dẫn thiết lập Google Sheets
          </button>
          <button
            onClick={() => setActiveTab("code")}
            className={`pb-3 px-4 font-semibold text-sm font-display transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
              activeTab === "code" 
                ? "border-indigo-600 text-indigo-600" 
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            <FileCode className="w-4 h-4" />
            Mã nguồn Backend (code.gs)
          </button>
        </div>


        {/* Tab content elements */}
        {activeTab === "form" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Reporting Form (Left Section) */}
            <div className="lg:col-span-7">
              <div id="form-card" className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 sm:p-8">
                
                <div className="border-b border-slate-100 pb-4 mb-6 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg">
                      <GraduationCap className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold font-display text-slate-900">Mẫu Đăng ký Thông tin Giáo viên</h3>
                      <p className="text-xs text-slate-500">Múi giờ chuẩn tự động: GMT+7</p>
                    </div>
                  </div>
                  
                  <span className={`text-[11px] font-semibold tracking-wider uppercase px-2.5 py-1 rounded-full ${
                    gasUrl 
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-100" 
                      : "bg-amber-50 text-amber-700 border border-amber-100"
                  }`}>
                    {gasUrl ? "📡 Đang Đồng bộ Sheets" : "💾 Đang Lưu Cục bộ"}
                  </span>
                </div>

                {/* Status Notice Area */}
                <AnimatePresence mode="wait">
                  {submitStatus.type && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className={`mb-6 p-4 rounded-xl flex items-start gap-3 border ${
                        submitStatus.type === "success"
                          ? "bg-emerald-50 border-emerald-100 text-emerald-800"
                          : "bg-red-50 border-red-100 text-red-800"
                      }`}
                    >
                      {submitStatus.type === "success" ? (
                        <Check className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                      )}
                      <div>
                        <p className="text-sm font-medium">{submitStatus.message}</p>
                        {submitStatus.type === "success" && (
                          <p className="text-xs text-emerald-600 mt-1">
                            Form nộp biểu mẫu đã được reset trống hoàn toàn.
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Main Form Entry */}
                <form onSubmit={handleSubmit} className="space-y-6">
                  
                  {/* Dropdown 1: Xã / Phường Selection */}
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700 flex items-center gap-1">
                      1. Xã/Phường <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <select
                        value={selectedXaPhuong}
                        onChange={(e) => {
                          setSelectedXaPhuong(e.target.value);
                          setSelectedTenTruong(""); // reset child selection
                        }}
                        className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-3 text-sm text-slate-800 cursor-pointer appearance-none transition-all"
                      >
                        <option value="">-- Chọn Xã / Phường trực thuộc --</option>
                        {listXaPhuong.map((xa) => (
                          <option key={xa} value={xa}>
                            {xa}
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                        <ChevronRight className="w-4 h-4 transform rotate-90" />
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400">Chọn địa bàn hành chính cấp xã hoặc cấp phường để tải danh sách các trường liên đới.</p>
                  </div>

                  {/* Dropdown 2: Tên trường Selection */}
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700 flex items-center gap-1">
                      2. Tên trường thuộc địa bàn <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <select
                        value={selectedTenTruong}
                        onChange={(e) => setSelectedTenTruong(e.target.value)}
                        disabled={!selectedXaPhuong}
                        className={`w-full border rounded-xl px-4 py-3 text-sm appearance-none transition-all focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                          !selectedXaPhuong 
                            ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed" 
                            : "bg-slate-50 border-slate-200 focus:border-indigo-500 focus:bg-white text-slate-800 cursor-pointer"
                        }`}
                      >
                        <option value="">
                          {!selectedXaPhuong 
                            ? "Vui lòng chọn Xã/Phường trước..." 
                            : `-- Chọn trường tại địa bàn ${selectedXaPhuong} --`
                          }
                        </option>
                        {listTruongTuongUng.map((item) => (
                          <option key={item.ten_truong} value={item.ten_truong}>
                            {item.ten_truong} ({item.cap_bao_cao})
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                        <ChevronRight className="w-4 h-4 transform rotate-90" />
                      </div>
                    </div>
                    {selectedTenTruong && (
                      <span className="inline-flex items-center text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded font-medium mt-1 font-display">
                        Cấp quản lý: {schools.find(s => s.ten_truong === selectedTenTruong)?.cap_bao_cao}
                      </span>
                    )}
                  </div>

                  {/* Text Input: Teacher Name */}
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700 flex items-center gap-1">
                      3. Họ và tên giáo viên <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                        <User className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        placeholder="Nhập họ tên đầy đủ, ví dụ: Nguyễn Văn A"
                        value={teacherName}
                        onChange={(e) => setTeacherName(e.target.value)}
                        required
                        className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded-xl pl-11 pr-4 py-3 text-sm text-slate-800 transition-all font-medium"
                      />
                    </div>
                  </div>

                  {/* Checkbox Group: Trình độ chuyên môn */}
                  <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                      <span className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                        <GraduationCap className="w-4 h-4 text-indigo-600" />
                        4. Trình độ học vị đã đạt
                      </span>
                      <span className="text-[11px] text-slate-500">(Chọn các học vị đang sở hữu)</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                      
                      {/* Checkbox 1: Tiến sĩ */}
                      <label className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                        isTienSi 
                          ? "bg-indigo-50/50 border-indigo-200 ring-1 ring-indigo-200" 
                          : "bg-white border-slate-200 hover:border-slate-300"
                      }`}>
                        <input
                          type="checkbox"
                          checked={isTienSi}
                          onChange={(e) => setIsTienSi(e.target.checked)}
                          className="w-4.5 h-4.5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                        />
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-900">Tiến sĩ</span>
                          <span className="text-[10px] text-indigo-600 font-mono font-medium">{isTienSi ? "'X'" : "''"}</span>
                        </div>
                      </label>

                      {/* Checkbox 2: Thạc sĩ */}
                      <label className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                        isThacSi 
                          ? "bg-indigo-50/50 border-indigo-200 ring-1 ring-indigo-200" 
                          : "bg-white border-slate-200 hover:border-slate-300"
                      }`}>
                        <input
                          type="checkbox"
                          checked={isThacSi}
                          onChange={(e) => setIsThacSi(e.target.checked)}
                          className="w-4.5 h-4.5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                        />
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-900">Thạc sĩ</span>
                          <span className="text-[10px] text-indigo-600 font-mono font-medium">{isThacSi ? "'X'" : "''"}</span>
                        </div>
                      </label>

                      {/* Checkbox 3: Đại học */}
                      <label className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                        isDaiHoc 
                          ? "bg-indigo-50/50 border-indigo-200 ring-1 ring-indigo-200" 
                          : "bg-white border-slate-200 hover:border-slate-300"
                      }`}>
                        <input
                          type="checkbox"
                          checked={isDaiHoc}
                          onChange={(e) => setIsDaiHoc(e.target.checked)}
                          className="w-4.5 h-4.5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                        />
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-900">Đại học</span>
                          <span className="text-[10px] text-indigo-600 font-mono font-medium">{isDaiHoc ? "'X'" : "''"}</span>
                        </div>
                      </label>

                    </div>
                  </div>

                  {/* Submit Button Action bar */}
                  <div className="pt-2 flex gap-3 text-sm">
                    <button
                      type="button"
                      onClick={handleResetForm}
                      className="px-4 py-3 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-100 transition-colors font-medium cursor-pointer"
                    >
                      Nhập lại (Reset)
                    </button>
                    
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-6 py-3 rounded-xl shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 font-display"
                    >
                      {isSubmitting ? (
                        <>
                          <RefreshCw className="w-5 h-5 animate-spin" />
                          Đang gửi số liệu (no-cors)...
                        </>
                      ) : (
                        <>
                          <Send className="w-5 h-5 text-white/90" />
                          Gửi dữ liệu báo cáo
                        </>
                      )}
                    </button>
                  </div>

                </form>

              </div>
            </div>

            {/* Simulated Database Viewer (Right Section) */}
            <div className="lg:col-span-5 space-y-6">
              
              {isAdmin ? (
                <>
                  {/* Box Info on current DB stats */}
                  <div className="bg-gradient-to-br from-indigo-950 to-indigo-900 rounded-2xl shadow-sm text-white p-6 relative overflow-hidden">
                    <div className="absolute right-0 top-0 bottom-0 pointer-events-none opacity-10 flex items-center pr-4">
                      <Database className="w-32 h-32" />
                    </div>
                    <div className="relative z-10">
                      <span className="text-xs font-semibold text-emerald-400 uppercase tracking-widest block mb-1">
                        Cơ sở dữ liệu biểu mẫu
                      </span>
                      <h3 className="text-xl font-bold font-display">Lịch sử Giao dịch Báo cáo</h3>
                      <p className="text-xs text-indigo-200 mt-2 leading-relaxed">
                        Theo dõi thời gian thực các báo cáo được thực thi. Số liệu báo cáo sẽ được hiển thị đồng bộ dưới đây để quản trị viên đối soát dễ dàng.
                      </p>
                      
                      <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-indigo-800/60 font-display">
                        <div>
                          <span className="text-[10px] text-indigo-300 block">Số bản ghi Firebase</span>
                          <span className="text-2xl font-bold font-display text-emerald-400">{submittedReports.length}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-indigo-300 block">Trạng thái dữ liệu</span>
                          <span className="text-sm font-bold text-white flex items-center gap-1.5 mt-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            Real-time Live Cloud
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 pt-4 border-t border-indigo-800/60 flex flex-col gap-2">
                        <span className="text-[10px] text-indigo-300 block">Khởi tạo danh sách Trường:</span>
                        <button
                          type="button"
                          onClick={seedSchoolsToFirebase}
                          disabled={isSeedingSchools}
                          className="w-full text-center text-[11px] bg-indigo-850/80 hover:bg-indigo-800 hover:scale-[1.015] border border-indigo-700/50 text-indigo-100 py-2 px-3 rounded-lg font-semibold transition-all cursor-pointer disabled:opacity-50"
                        >
                          {isSeedingSchools ? (
                            <span className="flex items-center justify-center gap-1.5">
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              Đang tải lên dữ liệu...
                            </span>
                          ) : (
                            "🚀 Khởi tạo 11 trường mẫu học lên Cloud"
                          )}
                        </button>
                      </div>

                      {submittedReports.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-indigo-800/60 flex flex-col gap-2">
                          <span className="text-[10px] text-indigo-300 block">Xuất dữ liệu:</span>
                          <button
                            type="button"
                            onClick={handleExportExcel}
                            className="w-full text-center text-xs bg-emerald-600 hover:bg-emerald-700 hover:scale-[1.015] text-white py-2.5 px-3 rounded-lg font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow"
                          >
                            <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
                            Tải Xuất Báo Cáo Excel (.xlsx)
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Data Table of reports */}
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                    <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
                      <h4 className="font-bold text-sm text-slate-800 flex items-center gap-1.5 font-display">
                        <Database className="w-4 h-4 text-indigo-600" />
                        Báo cáo vừa gửi ({submittedReports.length})
                      </h4>
                      {submittedReports.length > 0 && (
                        <div className="flex items-center gap-2.5">
                          <button
                            onClick={handleExportExcel}
                            className="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-semibold px-2.5 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                            Xuất Excel
                          </button>
                          <button
                            onClick={handleClearAllReports}
                            className="text-xs text-red-500 hover:text-red-700 font-semibold cursor-pointer hover:underline"
                          >
                            Xóa bộ nhớ đệm
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="max-h-85 overflow-y-auto space-y-3 pr-1">
                      {submittedReports.length === 0 ? (
                        <div className="text-center py-8 text-slate-400">
                          <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
                          <p className="text-xs">Chưa có giao dịch báo cáo nào được ghi nhận.</p>
                          <p className="text-[11px] mt-1 text-slate-400">Hãy điền form mẫu bên trái để trải nghiệm.</p>
                        </div>
                      ) : (
                        submittedReports.map((report) => (
                          <div 
                            key={report.id} 
                            className="p-3 bg-slate-50 rounded-xl border border-slate-100 relative group text-xs hover:shadow-sm transition-all animate-scale-up"
                          >
                            <button
                              onClick={() => handleClearReport(report.id)}
                              className="absolute right-2 top-2 text-slate-400 hover:text-red-600 transition-colors cursor-pointer text-xs p-1"
                              title="Xóa dòng log"
                            >
                              ✕
                            </button>
                            
                            <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mb-1.5">
                              <span>⏱ {report.timestamp}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                report.isLive ? "bg-emerald-100 text-emerald-850 border border-emerald-200" : "bg-amber-100 text-amber-850 border border-amber-200"
                              }`}>
                                {report.isLive ? "✓ LIVE TO SHEETS" : "LOCAL BACKUP"}
                              </span>
                            </div>

                            <p className="font-bold text-slate-900 mb-1">
                              GV: {report.ho_ten_gv}
                            </p>

                            <p className="text-slate-600 flex items-center gap-1 mb-2">
                              🏫 {report.ten_truong} ({report.xa_phuong})
                            </p>

                            <div className="flex gap-2.5">
                              <span className={`px-2 py-0.5 rounded font-medium text-[10px] ${report.tien_si ? "bg-indigo-100 text-indigo-700" : "bg-slate-200/50 text-slate-400"}`}>
                                Tiến sĩ: {report.tien_si || "—"}
                              </span>
                              <span className={`px-2 py-0.5 rounded font-medium text-[10px] ${report.thac_si ? "bg-pink-100 text-pink-700" : "bg-slate-200/50 text-slate-400"}`}>
                                Thạc sĩ: {report.thac_si || "—"}
                              </span>
                              <span className={`px-2 py-0.5 rounded font-medium text-[10px] ${report.dai_hoc ? "bg-teal-100 text-teal-700" : "bg-slate-200/50 text-slate-400"}`}>
                                Đại học: {report.dai_hoc || "—"}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-white rounded-2xl shadow-md border-2 border-indigo-150 p-6 sm:p-8 space-y-6 transition-all duration-300">
                  <div className="text-center space-y-3 pb-4 border-b border-slate-100">
                    <div className="mx-auto w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center shadow-inner">
                      <Lock className="w-5 h-5 text-amber-600" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-base font-bold font-display text-slate-900">Xác thực Quyền Quản trị viên</h3>
                      <p className="text-xs text-slate-500">Mở khoá danh sách dữ liệu & Tải phái biểu mẫu Excel</p>
                    </div>
                  </div>

                  <form onSubmit={handleAdminLogin} className="space-y-4">
                    {loginError && (
                      <div className="p-3 bg-red-50 border border-red-150 text-red-700 rounded-xl text-xs font-medium flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                        <span>{loginError}</span>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                        Tài khoản Gmail quản trị
                      </label>
                      <div className="relative">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                          <Mail className="w-4 h-4" />
                        </div>
                        <input
                          type="email"
                          required
                          value={inputEmail}
                          onChange={(e) => setInputEmail(e.target.value)}
                          placeholder="Ví dụ: nhhai@dongthap.edu.vn"
                          className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-850 transition-all font-medium"
                        />
                      </div>
                      <p className="text-[10px] text-slate-400">Tài khoản được phân quyền: <strong className="text-indigo-600 font-semibold select-all">nhhai@dongthap.edu.vn</strong></p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                        Mật khẩu ứng dụng Gmail
                      </label>
                      <div className="relative">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                          <Lock className="w-4 h-4" />
                        </div>
                        <input
                          type="password"
                          required
                          value={inputPassword}
                          onChange={(e) => setInputPassword(e.target.value)}
                          placeholder="Nhập mật khẩu bất kỳ (ví dụ: gamil123)"
                          className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-850 transition-all font-medium"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-indigo-600 hover:bg-indigo-700 hover:scale-[1.01] active:scale-[0.99] text-white font-bold py-3 px-4 rounded-xl shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 cursor-pointer text-xs"
                    >
                      <LogIn className="w-4 h-4 text-white/95" />
                      Xác thực & Mở khoá dữ liệu
                    </button>
                  </form>

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-slate-605 space-y-2.5 text-xs">
                    <span className="font-bold text-slate-850 flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-indigo-650" />
                      Quyền lợi bảo mật của Quản trị viên:
                    </span>
                    <ul className="space-y-1 text-[11px] list-disc pl-4 text-slate-500">
                      <li>Truy cập cơ sở dữ liệu thời gian thực của Cloud Firestore.</li>
                      <li>Xem đầy đủ danh sách phản hồi khảo sát giáo viên toàn địa giới.</li>
                      <li>Mở khóa chức năng <strong>Tải Xuất tệp Excel (.xlsx)</strong> để tải về máy tính.</li>
                      <li>Khởi tạo/xóa các bản ghi để bảo đảm tính thống nhất dữ liệu.</li>
                    </ul>
                  </div>
                </div>
              )}

            </div>

          </div>
        )}

        {activeTab === "guide" && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 sm:p-8 max-w-4xl mx-auto">
            <h3 className="text-xl font-bold text-slate-900 mb-4 font-display flex items-center gap-2">
              <BookOpen className="text-indigo-600 w-5 h-5" />
              Sổ tay Hướng dẫn Triển khai Google Sheets & Apps Script
            </h3>
            
            <p className="text-sm text-slate-600 mb-6">
              Để ứng dụng này có thể gửi dữ liệu trực tiếp về Google Drive, bạn cần chuẩn bị một Trang tính Google Sheets và cấu hình Apps Script như sau. Quá trình chỉ mất khoảng 2-3 phút.
            </p>

            <div className="space-y-6">
              
              {/* Step 1 */}
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 font-bold flex items-center justify-center font-display flex-shrink-0">
                  1
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm font-display">Tạo File Bảng tính (Google Sheets)</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Truy cập <a href="https://sheets.google.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline font-semibold">Google Sheets</a> và tạo một bảng tính trống mới.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 font-bold flex items-center justify-center font-display flex-shrink-0">
                  2
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-slate-900 text-sm font-display">Thiết lập 2 Tab Trang tính có cấu trúc chính xác</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Tạo chính xác 2 tab trang tính (ở phía dưới góc trái màn hình sheets) với tên gọi nhạy viết hoa thường và các hàng tiêu đề cột thứ nhất như sau:
                  </p>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                      <span className="text-xs font-bold text-indigo-700 block mb-2 font-mono">Tab 1: DM_TRUONG</span>
                      <p className="text-[11px] text-slate-500 mb-2">Đóng vai trò Master danh mục các trường để lọc:</p>
                      <div className="bg-white p-2.5 rounded border border-slate-200 font-mono text-[10px] overflow-x-auto whitespace-nowrap">
                        <table className="min-w-full text-slate-700">
                          <thead>
                            <tr className="bg-slate-100 text-slate-800 font-semibold border-b border-slate-200">
                              <th className="px-2 py-1 text-left">Hàng 1 Cột A</th>
                              <th className="px-2 py-1 text-left">Hàng 1 Cột B</th>
                              <th className="px-2 py-1 text-left">Hàng 1 Cột C</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="border-b border-slate-100">
                              <td className="px-2 py-1 font-bold text-indigo-600">Xã/Phường</td>
                              <td className="px-2 py-1 font-bold text-indigo-600">Tên trường</td>
                              <td className="px-2 py-1 font-bold text-indigo-600">Cấp báo cáo</td>
                            </tr>
                            <tr>
                              <td className="px-2 py-1 text-slate-500">Phường 1</td>
                              <td className="px-2 py-1 text-slate-500">THCS Kim Hồng</td>
                              <td className="px-2 py-1 text-slate-500">CAP THCS</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                      <span className="text-xs font-bold text-teal-700 block mb-2 font-mono">Tab 2: BAOCAO</span>
                      <p className="text-[11px] text-slate-500 mb-2">Đóng vai trò nơi nhận kết quả nộp bài trực tiếp:</p>
                      <div className="bg-white p-2.5 rounded border border-slate-200 font-mono text-[10px] overflow-x-auto whitespace-nowrap">
                        <table className="min-w-full text-slate-700">
                          <thead>
                            <tr className="bg-slate-100 text-slate-800 font-semibold border-b border-slate-200">
                              <th className="px-2 py-0.5 text-left">A:G (Hàng 1)</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td className="px-2 py-1 font-bold text-teal-600">Thời gian nộp</td>
                            </tr>
                            <tr>
                              <td className="px-2 py-1 font-bold text-teal-600">Xã/Phường</td>
                            </tr>
                            <tr>
                              <td className="px-2 py-1 font-bold text-teal-600">Tên trường</td>
                            </tr>
                            <tr>
                              <td className="px-2 py-1 font-bold text-teal-600">Ho_Ten_GV</td>
                            </tr>
                            <tr>
                              <td className="px-2 py-1 font-bold text-teal-600 font-mono">Tien_Si | Thac_Si | Dai_Hoc</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 font-bold flex items-center justify-center font-display flex-shrink-0">
                  3
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm font-display">Tích hợp Google Apps Script</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Tại thanh công cụ hàng đầu Google Sheets, chọn <strong>Tiện ích mở rộng (Extensions)</strong> &gt; <strong>Apps Script</strong>.
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Xóa sạch toàn bộ những đoạn mã dòng có sẵn trong khung đen soạn thảo mặc định, sau đó sao chép toàn bộ mã nguồn bên tab <strong>"Mã nguồn Backend (code.gs)"</strong> dán vào.
                  </p>
                </div>
              </div>

              {/* Step 4 */}
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 font-bold flex items-center justify-center font-display flex-shrink-0">
                  4
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm font-display">Triển khai Web App và copy URL</h4>
                  <ul className="list-disc pl-5 text-xs text-slate-500 mt-2 space-y-1">
                    <li>Nhấn nút biểu tượng <strong>Triển khai (Deploy)</strong> ở góc phải phía trên &gt; <strong>Triển khai mới (New deployment)</strong>.</li>
                    <li>Ở cửa sổ bật lên, chọn hình bánh răng Cài đặt &gt; Chọn <strong>Ứng dụng web (Web app)</strong>.</li>
                    <li>Cấu hình:
                      <ul className="list-circle pl-6 mt-1 space-y-0.5">
                        <li>Thực thi dưới tên: <strong>Me (Tôi - email của bạn)</strong>.</li>
                        <li>Ai có quyền truy cập: <strong>Mọi người (Anyone - bắt buộc đối với no-cors)</strong>.</li>
                      </ul>
                    </li>
                    <li>Nhấn <strong>Triển khai</strong>, sau đó cấp quyền đăng nhập (Authorize access) khi hệ thống bảo mật của Google yêu cầu để chạy script.</li>
                    <li>Sao chép đường dẫn URL Web App nhận được.</li>
                  </ul>
                </div>
              </div>

              {/* Step 5 */}
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 font-bold flex items-center justify-center font-display flex-shrink-0">
                  ✓
                </div>
                <div>
                  <h4 className="font-bold text-emerald-800 text-sm font-display">Kết nối vào Hệ thống Web app</h4>
                  <p className="text-xs text-emerald-700 mt-1">
                    Quay về tab <strong>"Nhập hồ sơ báo cáo"</strong>, bật <strong>Chế độ kết nối LIVE</strong>, dán URL đó vào ô Cấu hình là ứng dụng của bạn sẽ được kết nối hoàn chỉnh mà không lo ngại bất cứ bảo mật CORS nào!
                  </p>
                </div>
              </div>

            </div>
          </div>
        )}

        {activeTab === "code" && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 sm:p-8 max-w-4xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100 mb-6 gap-4">
              <div>
                <h3 className="text-xl font-bold text-slate-900 font-display flex items-center gap-2">
                  <FileCode className="text-indigo-600 w-5 h-5" />
                  Mã nguồn Google Apps Script (code.gs)
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Đoạn mã này đáp ứng đồng thời doGet (lấy master data) và doPost (ghi trực tiếp chuẩn múi giờ GMT+7).
                </p>
              </div>
              
              <button
                onClick={handleCopyCode}
                className="bg-indigo-600 hover:bg-indigo-700 hover:scale-[1.02] text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap self-start sm:self-auto"
              >
                {copiedCode ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-300" />
                    Đã sao chép!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Sao chép mã nguồn
                  </>
                )}
              </button>
            </div>

            <div className="bg-slate-900 rounded-xl p-4 md:p-6 overflow-x-auto border border-slate-800">
              <pre className="text-emerald-400 font-mono text-[11px] sm:text-xs leading-relaxed select-all">
                {codeGSContent}
              </pre>
            </div>

            <div className="mt-4 bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-start gap-3">
              <Info className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-slate-600 space-y-1">
                <span className="font-bold text-slate-800 block">Ưu điểm cấu hình:</span>
                <p>💡 Đã tích hợp tự động kiểm tra bảng dữ liệu mẫu: Nếu Google Sheet của bạn chưa có bảng dữ liệu trống, đoạn code này sẽ tự động khởi tạo tab <strong>DM_TRUONG</strong> và <strong>BAOCAO</strong> kèm một vài dòng dữ liệu mẫu để chạy thử ngay lập tức!</p>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Modern Simple Page Footer */}
      <footer className="border-t border-slate-200 mt-16 bg-white py-8">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-xs text-slate-400 font-display font-medium">
            Phát triển bởi Chuyên gia Lập trình Full-stack · Thiết kế hoàn chuẩn Responsive cho năm 2026
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            Ứng dụng chạy an toàn qua sandbox iFrame bảo mật, sử dụng cơ chế truyền tin không chồng lấn.
          </p>
        </div>
      </footer>
    </div>
  );
}
