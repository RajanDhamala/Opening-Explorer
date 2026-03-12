import axios from "axios";
import { useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const LoginPage = () => {
  const [email, setemail] = useState("");
  const [password, setpassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const loginUser = async (payload: { email: string; password: string }) => {
    return axios.post(
      "http://localhost:3030/users/login",
      payload,
      { withCredentials: true }
    );
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setIsSubmitting(true);
    try {
      await loginUser(parsed.data);
      toast.success("Logged in successfully");
      navigate("/");
    } catch (error) {
      toast.error("Login failed. Check your credentials.");
      console.log("error while loggingin", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900/70 p-6 shadow-2xl">
        <div className="mb-6 text-left">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-neutral-400">Welcome back. Enter your credentials to continue.</p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2 text-left">
            <label className="text-sm font-medium text-neutral-300">Email</label>
            <input
              className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none focus:ring-2 focus:ring-neutral-700"
              type="email"
              placeholder="tinku@gmail.com"
              value={email}
              onChange={(e) => setemail(e.target.value)}
            />
          </div>

          <div className="space-y-2 text-left">
            <label className="text-sm font-medium text-neutral-300">Password</label>
            <input
              className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none focus:ring-2 focus:ring-neutral-700"
              type="password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setpassword(e.target.value)}
            />
          </div>

          <button
            className="w-full rounded-lg bg-neutral-100 px-4 py-2.5 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-200 active:bg-neutral-300 disabled:cursor-not-allowed disabled:opacity-70"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
