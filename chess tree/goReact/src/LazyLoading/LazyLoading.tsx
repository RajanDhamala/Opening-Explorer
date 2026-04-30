
import { lazy } from "react";

export const LazyLandingPage = lazy(() => import("../Pages/LandingPage.tsx"));
export const LazyLoginPage = lazy(() => import("../Auth/LoginPage.tsx"));
export const LazyRegisterPage = lazy(() => import("../Auth/Registerpage.tsx"));
export const LazyTestPage = lazy(() => import("../Pages/Testpage.tsx"));
export const LazyBoardPage = lazy(() => import("../Pages/Board.tsx"));
export const LazyListPage = lazy(() => import("../Pages/ListPage.tsx"));
export const LazyPuzzlesPage = lazy(() => import("../Pages/PuzzlesPage.tsx"));
export const LazyCustomEvalPage = lazy(() => import("../Pages/CustomEval.tsx"));
export const LazyWoodpeakPage = lazy(() => import("../Pages/WoodpeakerPage.tsx"));
export const LazySwiftChess = lazy(() => import("../Pages/SwiftChess.tsx"))
export const LazyWoodpeakerSessionPage = lazy(() => import("../Pages/WoodpeakerSessionPage.tsx"));
export const LazyGraphPage = lazy(() => import("../Pages/GraphPage.tsx"))
export const LazyCanvasPage = lazy(() => import("../Pages/CanvasPage.tsx"))
