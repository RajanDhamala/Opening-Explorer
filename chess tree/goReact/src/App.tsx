
import { Suspense, useEffect } from "react";
import "./index.css";
import {
  LazyLandingPage,
  LazyRegisterPage,
  LazyLoginPage,
  LazyTestPage,
  LazyListPage,
  LazyBoardPage,
  LazyWoodpeakPage,
  LazyWoodpeakerSessionPage,
  LazyCustomEvalPage,
  LazySwiftChess,
  LazyGraphPage,
  LazyCanvasPage
} from "./LazyLoading/LazyLoading";
import { BrowserRouter as Router, Routes, Route, } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import queryClient from "./Utils/QueryConfig.tsx";
import Loader from "./LazyLoading/Loader.tsx";
import { Toaster } from "react-hot-toast";
import axios from "axios";
import { useAuthStore } from "./ZustandStore";

function App() {
  const setUser = useAuthStore((state) => state.setUser);
  const setAuthReady = useAuthStore((state) => state.setAuthReady);

  useEffect(() => {
    let isActive = true;

    const fetchMe = async () => {
      try {
        const response = await axios.get("htcodetp://localhost:3030/users/me", {
          withCredentials: true,
        });
        if (!isActive) return;
        setUser(response.data ?? null);
      } catch (error) {
        if (!isActive) return;
        setUser(null);
      } finally {
        if (!isActive) return;
        setAuthReady(true);
      }
    };

    fetchMe();
    return () => {
      isActive = false;
    };
  }, [setUser, setAuthReady]);

  return (
    <QueryClientProvider client={queryClient}>
      <Toaster position="top-right" reverseOrder={false} />
      <Router>
        <Suspense fallback={<Loader />}>
          <Routes>
            <Route path="/" element={<LazyLandingPage />} />
            <Route path="/login" element={<LazyLoginPage />} />
            <Route path="/register" element={<LazyRegisterPage />} />
            <Route path="/list" element={<LazyListPage />} />
            <Route path="/test" element={<LazyTestPage />} />


            <Route path="/custom" element={<LazyCustomEvalPage />} />
            <Route path="/board" element={<LazyBoardPage />} />

            <Route path="/swift" element={<LazySwiftChess />} />

            <Route path="/graph" element={<LazyGraphPage />} />
            <Route path="/graph/:sessionId" element={<LazyGraphPage />} />

            <Route path="/wood" element={<LazyWoodpeakPage />} />
            <Route path="/woodpeaker/:id" element={<LazyWoodpeakerSessionPage />} />

            <Route path="/canvas" element={<LazyCanvasPage />} />


            <Route path="*" element={<div className="p-10 text-center text-red-500 font-bold">404 | Page Not Found</div>} />
          </Routes>
        </Suspense>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
