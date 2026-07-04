import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import LevelTest from './pages/LevelTest';
import Reading from './pages/Reading';
import ArticleList from './pages/ArticleList';
import ArticleDetail from './pages/ArticleDetail';
import VocabManager from './pages/VocabManager';
import VocabDetail from './pages/VocabDetail';
import ReviewList from './pages/ReviewList';
import TagsManager from './pages/TagsManager';
import Settings from './pages/Settings';
import ExportImport from './pages/ExportImport';
import DictionaryManager from './pages/DictionaryManager';
import Login from './pages/Login';
import LevelTestManager from './pages/LevelTestManager';

function getStoredUser() {
  try { return JSON.parse(localStorage.getItem('lexhue_user') || 'null'); } catch (e) { return null; }
}

function AdminRoute({ children }) {
  const user = getStoredUser();
  if (user?.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

function ProtectedApp() {
  const token = localStorage.getItem('lexhue_token');
  if (!token) return <Navigate to="/login" replace />;
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/level-test" element={<LevelTest />} />
        <Route path="/level-test-admin" element={<AdminRoute><LevelTestManager /></AdminRoute>} />
        <Route path="/reading/:articleId" element={<Reading />} />
        <Route path="/articles" element={<ArticleList />} />
        <Route path="/articles/new" element={<ArticleDetail />} />
        <Route path="/articles/:id" element={<ArticleDetail />} />
        <Route path="/vocab" element={<VocabManager />} />
        <Route path="/vocab/:wordId" element={<VocabDetail />} />
        <Route path="/review" element={<ReviewList />} />
        <Route path="/tags" element={<TagsManager />} />
        <Route path="/settings" element={<AdminRoute><Settings /></AdminRoute>} />
        <Route path="/export" element={<ExportImport />} />
        <Route path="/dictionary" element={<AdminRoute><DictionaryManager /></AdminRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={<ProtectedApp />} />
      </Routes>
    </BrowserRouter>
  );
}
