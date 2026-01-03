import { useState } from 'react';
import { Mail, Lock, User, Eye, EyeOff, Loader2, Crown, Shield } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';



const RegisterPage = ({ onSwitchToLogin }) => {

  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [formData, setFormData] = useState({
    email: '',
    fullname: '',
    password: ''
  });

  const showToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const handleSubmit = async () => {
    if (!formData.email || !formData.fullname || !formData.password) {
      showToast('Please fill in all fields', 'error');
      return;
    }
    if (formData.password.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }
    if (formData.fullname.length < 5 || formData.fullname.length > 20) {
      showToast('Full name must be between 5 and 20 characters', 'error');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:8000/users/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
          fullname: formData.fullname,
          password: formData.password
        })
      });

      const data = await response.json();

      if (response.ok) {
        showToast('Registration successful! Welcome to Chess Platform!', 'success');
        console.log('Register Response:', data);
        setFormData({ email: '', fullname: '', password: '' });
        setTimeout(() => onSwitchToLogin(), 1500);
      } else {
        showToast(data.message || 'Registration failed. Please try again.', 'error');
      }
    } catch (error) {
      showToast('Network error. Please check your connection.', 'error');
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-neutral-900 to-black flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated Chess Pattern Background */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-10 right-10 text-9xl">♚</div>
        <div className="absolute bottom-20 left-20 text-9xl">♛</div>
        <div className="absolute top-1/3 left-1/4 text-7xl">♜</div>
        <div className="absolute bottom-1/3 right-1/4 text-7xl">♝</div>
      </div>

      {/* Toast Container */}
      <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 space-y-2 w-full max-w-md px-4">
        {toasts.map(toast => (
          <Alert 
            key={toast.id}
            className={`${
              toast.type === 'success' 
                ? 'bg-emerald-600 border-emerald-700 text-white' 
                : 'bg-red-600 border-red-700 text-white'
            } shadow-lg animate-in slide-in-from-top`}
          >
            <AlertDescription className="font-medium">
              {toast.message}
            </AlertDescription>
          </Alert>
        ))}
      </div>
      
      <div className="w-full max-w-md relative z-10">
        <div className="bg-gradient-to-b from-gray-800 to-gray-900 rounded-3xl shadow-2xl border border-gray-700 overflow-hidden backdrop-blur-sm animate-in fade-in slide-in-from-bottom duration-500">
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-8 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-black opacity-20"></div>
            <div className="relative z-10">
              <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-2xl border-4 border-emerald-200">
                <Shield className="w-10 h-10 text-emerald-600" />
              </div>
              <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">Join Us</h1>
              <p className="text-emerald-100 text-lg">
                Begin your grandmaster journey
              </p>
            </div>
          </div>

          {/* Form */}
          <div className="p-8">
            <div className="space-y-6">
              {/* Email */}
              <div>
                <label className="block text-sm font-bold text-gray-300 mb-2 tracking-wide">
                  EMAIL ADDRESS
                </label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 group-focus-within:text-emerald-500 transition-colors" />
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    onKeyPress={handleKeyPress}
                    className="w-full bg-gray-700 text-white border-2 border-gray-600 rounded-xl pl-12 pr-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all hover:border-gray-500"
                    placeholder="your@email.com"
                    disabled={isLoading}
                  />
                </div>
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-sm font-bold text-gray-300 mb-2 tracking-wide">
                  FULL NAME
                </label>
                <div className="relative group">
                  <User className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 group-focus-within:text-emerald-500 transition-colors" />
                  <input
                    type="text"
                    name="fullname"
                    value={formData.fullname}
                    onChange={handleChange}
                    onKeyPress={handleKeyPress}
                    className="w-full bg-gray-700 text-white border-2 border-gray-600 rounded-xl pl-12 pr-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all hover:border-gray-500"
                    placeholder="John Doe"
                    disabled={isLoading}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-2 ml-1">Must be 5-20 characters</p>
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-bold text-gray-300 mb-2 tracking-wide">
                  PASSWORD
                </label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 group-focus-within:text-emerald-500 transition-colors" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    onKeyPress={handleKeyPress}
                    className="w-full bg-gray-700 text-white border-2 border-gray-600 rounded-xl pl-12 pr-14 py-3.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all hover:border-gray-500"
                    placeholder="••••••••"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-emerald-500 transition-colors"
                    disabled={isLoading}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-2 ml-1">Minimum 6 characters</p>
              </div>

              {/* Submit Button */}
              <button
                onClick={handleSubmit}
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold py-4 rounded-xl hover:from-emerald-700 hover:to-teal-700 focus:outline-none focus:ring-4 focus:ring-emerald-500 focus:ring-opacity-50 transition-all transform hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-xl text-lg"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center">
                    <Loader2 className="animate-spin h-6 w-6 mr-2" />
                    Creating Account...
                  </span>
                ) : (
                  'Create Account'
                )}
              </button>
            </div>

            {/* Switch to Login */}
            <div className="mt-8 text-center">
              <p className="text-gray-400 mb-3">Already have an account?</p>
              <button
                onClick={onSwitchToLogin}
                className="text-emerald-500 hover:text-emerald-400 font-bold transition-colors text-lg underline decoration-2 underline-offset-4"
                disabled={isLoading}
              >
                Sign In Instead
              </button>
            </div>
          </div>
        </div>

        {/* Footer Info */}
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


export default RegisterPage