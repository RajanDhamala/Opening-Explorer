import { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, Loader2, Crown } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import axios from 'axios';
import { Link } from 'react-router-dom';
const LoginPage = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  const handleSubmit = async () => {
    if (!formData.email || !formData.password) {
      toast.error('Please fill in all fields');
      return;
    }

    setIsLoading(true);

    try {
      const { data } = await axios.post(
        'http://localhost:8000/users/login',
        {
          email: formData.email,
          password: formData.password
        },
        { withCredentials: true }
      );

      toast.success('Login successful! Welcome back!');
      console.log('Login Response:', data);

    } catch (error) {
      if (error.response) {
        toast.error(error.response.data.message || 'Login failed. Please try again.');
      } else {
        toast.error('Network error. Please check your connection.');
      }
      console.error('Login error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') handleSubmit();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-neutral-900 to-black flex items-center justify-center p-4 relative overflow-hidden">
      <Toaster position="top-right" reverseOrder={false} />

      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-10 left-10 text-9xl">♔</div>
        <div className="absolute bottom-20 right-20 text-9xl">♕</div>
        <div className="absolute top-1/3 right-1/4 text-7xl">♖</div>
        <div className="absolute bottom-1/3 left-1/4 text-7xl">♗</div>
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="bg-gradient-to-b from-gray-800 to-gray-900 rounded-3xl shadow-2xl border border-gray-700 overflow-hidden backdrop-blur-sm animate-in fade-in slide-in-from-bottom duration-500">
          {/* Header */}
          <div className="bg-gradient-to-r from-amber-600 to-orange-600 p-8 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-black opacity-20"></div>
            <div className="relative z-10">
              <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-2xl border-4 border-amber-200">
                <Crown className="w-10 h-10 text-amber-600" />
              </div>
              <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">Welcome Back</h1>
              <p className="text-amber-100 text-lg">
                Continue your chess mastery
              </p>
            </div>
          </div>

          {/* Form */}
          <div className="p-8 space-y-6">
            {/* Email */}
            <div>
              <label className="block text-sm font-bold text-gray-300 mb-2 tracking-wide">
                EMAIL ADDRESS
              </label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 group-focus-within:text-amber-500 transition-colors" />
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  onKeyPress={handleKeyPress}
                  className="w-full bg-gray-700 text-white border-2 border-gray-600 rounded-xl pl-12 pr-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all hover:border-gray-500"
                  placeholder="your@email.com"
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-bold text-gray-300 mb-2 tracking-wide">
                PASSWORD
              </label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 group-focus-within:text-amber-500 transition-colors" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  onKeyPress={handleKeyPress}
                  className="w-full bg-gray-700 text-white border-2 border-gray-600 rounded-xl pl-12 pr-14 py-3.5 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all hover:border-gray-500"
                  placeholder="••••••••"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-amber-500 transition-colors"
                  disabled={isLoading}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-amber-600 to-orange-600 text-white font-bold py-4 rounded-xl hover:from-amber-700 hover:to-orange-700 focus:outline-none focus:ring-4 focus:ring-amber-500 focus:ring-opacity-50 transition-all transform hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-xl text-lg"
            >
              {isLoading ? (
                <span className="flex items-center justify-center">
                  <Loader2 className="animate-spin h-6 w-6 mr-2" />
                  Signing In...
                </span>
              ) : (
                'Sign In to Play'
              )}
            </button>

            <div className="mt-8 text-center">
              <p className="text-gray-400 mb-3">New to chess platform?</p>
              <Link to={'/register'}>
               <button
                className="text-amber-500 hover:text-amber-400 font-bold transition-colors text-lg underline decoration-2 underline-offset-4"
                disabled={isLoading}
              >
                Create Your Account
              </button>

              </Link>
                         </div>
          </div>
        </div>

        <div className="mt-6 text-center text-gray-500 text-sm">
          <p className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/>
            </svg>
            Secure & encrypted authentication
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
