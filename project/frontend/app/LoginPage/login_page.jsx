"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Poppins } from 'next/font/google';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

export default function LoginPage() {
  const router = useRouter();
  const [role, setRole] = useState("student");
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    rememberMe: false,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("role");
    if (stored === "instructor" || stored === "student") {
      setRole(stored);
    }
  }, []);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (role === "instructor") {
      router.push("/Instructor");
    } else {
      router.push("/Student/HomePage");
    }
  };

  return (
    <div className="min-h-screen bg-purple-100 flex-col">

      {/* Main Content */}
      <div className="h-[80vh] flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-lg">
          {/* Sign In Card */}
          <div className="bg-white rounded-[28px] shadow-lg p-16 w-[523px] h-[831px] flex flex-col justify-center">
            {/* Title */}
            <h1 className={`text-[42.09px] font-bold font-[700] mb-10 ${poppins.className}`}>
              {role === "instructor" ? "Instructor Sign In" : "Student Sign In"}
            </h1>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Username/Email Field */}
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <input
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleInputChange}
                  placeholder="Username or email"
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              {/* Password Field */}
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder="Password"
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              {/* Remember Me & Forgot Password */}
              <div className="flex items-center justify-between">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    name="rememberMe"
                    checked={formData.rememberMe}
                    onChange={handleInputChange}
                    className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                  />
                  <span className="ml-2 text-sm text-gray-600">Remember me</span>
                </label>
                <a href="#" className="text-sm text-gray-600 hover:text-purple-600 transition-colors">
                  Forgot password?
                </a>
              </div>

              {/* Sign In Button */}
              <button
                type="submit"
                className="w-full py-3 px-4 bg-gradient-to-r from-purple-500 to-blue-500 text-white font-semibold rounded-lg hover:from-purple-600 hover:to-blue-600 transition-all duration-300 shadow-md"
              >
                Sign In
              </button>
            </form>

            {/* Create Account Link */}
            <div className="mt-6 text-center">
              <span className="text-gray-600">New here? </span>
              <a href="#" className="text-purple-600 font-medium hover:text-purple-700 transition-colors">
                Create an Account
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
