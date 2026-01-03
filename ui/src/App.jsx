import { Suspense, useEffect, useState } from "react";
import "./index.css";
import {
  LazyLandingPage,
  LazyRegisterPage,
  LazyLoginPage,
  LazyTestPage,
} from "./LazyLoading/LazyLoading";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import queryClient from "./Utils/QueryConfig.jsx";
import Loader from "./LazyLoading/Loader.jsx";
import { Toaster } from "react-hot-toast";
import Matchmaking from "./Pages/Matchmaking";
import ChessBoard from "./Pages/ChessBoard";
import ChessGame from "./Pages/GameChess";
import OldGameChess from "./Pages/Oldcode";
import axios from "axios";
import useSocket from "./ZustandStore/SocketStore";
import useUserStore from "./ZustandStore/UserStore.jsx";
import ChessPage from "./Board/Parent";
import TestBoard from "./Board/TestBoard";

function App() {
  const [userLoaded, setUserLoaded] = useState(false);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const maxAttempts = 3;

  const currentUser = useUserStore((state) => state.currentUser);
  const setCurrentUser = useUserStore((state) => state.setCurrentUser);

  const socket = useSocket((state) => state.socket);
  const isConnecting = useSocket((state) => state.isConnecting);
  const connect = useSocket((state) => state.connect);
  const disconnect = useSocket((state) => state.disconnect);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await axios.get("http://localhost:8000/users/me", {
          withCredentials: true,
        });
        console.log("Session data:", res.data);
        setCurrentUser(res.data);
      } catch (err) {
        console.error("Session check failed:", err.message);
      } finally {
        setUserLoaded(true);
      }
    };
  
    checkSession();
  }, [setCurrentUser]);


  useEffect(() => {
    if ( !socket && !isConnecting && connectionAttempts < maxAttempts) {
      connect("http://localhost:8080", currentUser.id);
      setConnectionAttempts((prev) => prev + 1);
    }
  }, [ socket, isConnecting, connect, connectionAttempts]);

  useEffect(() => {
    if (connectionAttempts >= maxAttempts && !socket && !isConnecting) {
      console.error("Max connection attempts reached. Please check server status.");
    }
  }, [connectionAttempts, socket, isConnecting]);

  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  if (!userLoaded) return <Loader />;

  return (
    <QueryClientProvider client={queryClient}>
      <Toaster position="top-right" reverseOrder={false} />
      <Router>
        <Suspense fallback={<Loader />}>
          <Routes>
            <Route path="/" element={<LazyLandingPage />} />
            <Route path="/login" element={<LazyLoginPage />} />
            <Route path="/register" element={<LazyRegisterPage />} />
            <Route path="/test" element={<TestBoard/>} />
            <Route path="/making" element={<Matchmaking />} />
            <Route path="/game/:gameId" element={<ChessBoard />} />
            <Route path="/play" element={<ChessGame />} />
            <Route path="/old" element={<OldGameChess />} />

            <Route path="/ai" element={<ChessPage />} />

            <Route
              path="*"
              element={
                <div className="p-10 text-center text-red-500 font-bold">
                  404 | Page Not Found
                </div>
              }
            />
          </Routes>
        </Suspense>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
