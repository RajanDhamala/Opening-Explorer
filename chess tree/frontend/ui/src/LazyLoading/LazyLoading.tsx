
import { lazy } from "react";

export const LazyLandingPage = lazy(() => import("../Pages/LandingPage.tsx"));
export const LazyLoginPage = lazy(() => import("../Auth/LoginPage.tsx"));
export const LazyRegisterPage = lazy(() => import("../Auth/Registerpage.tsx"));
export const LazyTestPage = lazy(() => import("../Pages/Testpage.tsx"));
export const LazyChessTreePage = lazy(() => import("../Pages/ChessTree.tsx"));

