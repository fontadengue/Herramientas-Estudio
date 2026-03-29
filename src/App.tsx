/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  FolderIcon, 
  FileCodeIcon, 
  PlusIcon, 
  SearchIcon, 
  XIcon, 
  ChevronRightIcon, 
  ChevronDownIcon,
  UploadIcon,
  LogOutIcon,
  LogInIcon,
  Trash2Icon,
  FolderPlusIcon,
  FilePlusIcon,
  MenuIcon,
  HomeIcon,
  DownloadIcon,
  FileTextIcon,
  ExternalLinkIcon,
  TableIcon
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  where, 
  deleteDoc, 
  doc, 
  orderBy,
  getDocs,
  updateDoc
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User
} from 'firebase/auth';
import { auth, db } from './firebase';
import { cn } from './lib/utils';

const getShortcutUrl = (content: string) => {
  if (!content) return null;
  const trimmed = content.trim();
  
  // Case 1: Standard .url file format ([InternetShortcut] URL=...)
  const urlMatch = trimmed.match(/URL\s*=\s*(https?:\/\/[^\s\r\n]+)/i);
  if (urlMatch) return urlMatch[1];
  
  // Case 2: Just a URL in the file
  if (trimmed.match(/^https?:\/\/[^\s\r\n]+$/i)) {
    return trimmed;
  }

  // Case 3: HTML redirect (<meta http-equiv="refresh" content="0; url=...">)
  const metaMatch = trimmed.match(/url\s*=\s*(https?:\/\/[^\s"'>]+)/i);
  if (metaMatch && trimmed.toLowerCase().includes('http-equiv="refresh"')) {
    return metaMatch[1];
  }
  
  return null;
};

// --- Types ---

interface Folder {
  id: string;
  name: string;
  parentId: string;
  userId: string;
}

interface DocumentFile {
  id: string;
  name: string;
  content: string;
  folderId: string;
  userId: string;
  createdAt: string;
  type: 'html' | 'txt' | 'xlsx';
}

interface SidebarPanelProps {
  folderId: string;
  folders: Folder[];
  files: DocumentFile[];
  index: number;
  navigationPath: string[];
  setNavigationPath: (path: string[]) => void;
  selectedFile: DocumentFile | null;
  setSelectedFile: (file: DocumentFile | null) => void;
  isEditMode: boolean;
}

// --- Components ---

export default function App() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<DocumentFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<DocumentFile | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [lastKeyPressed, setLastKeyPressed] = useState<string | null>(null);
  const [lastKeyTime, setLastKeyTime] = useState<number>(0);
  const [navigationPath, setNavigationPath] = useState<string[]>(['root']);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);

  const shortcutUrl = selectedFile ? getShortcutUrl(selectedFile.content) : null;

  // --- Data Fetching ---

  useEffect(() => {
    const hasSeenTutorial = localStorage.getItem('hasSeenTutorial');
    if (!hasSeenTutorial) {
      setShowTutorial(true);
    }

    const foldersQuery = query(collection(db, 'folders'));
    const filesQuery = query(
      collection(db, 'htmlFiles'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeFolders = onSnapshot(foldersQuery, (snapshot) => {
      const folderData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Folder));
      setFolders(folderData);
    });

    const unsubscribeFiles = onSnapshot(filesQuery, (snapshot) => {
      const fileData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DocumentFile));
      setFiles(fileData);
    });

    return () => {
      unsubscribeFolders();
      unsubscribeFiles();
    };
  }, []);

  // --- Keyboard Shortcut ---

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const now = Date.now();
      
      if (e.key === '*') {
        if (lastKeyPressed === '*' && now - lastKeyTime < 500) {
          setIsUploadModalOpen(true);
          setLastKeyPressed(null);
        } else {
          setLastKeyPressed('*');
          setLastKeyTime(now);
        }
      } else if (e.key === '/') {
        if (lastKeyPressed === '/' && now - lastKeyTime < 500) {
          setIsEditMode(!isEditMode);
          setLastKeyPressed(null);
        } else {
          setLastKeyPressed('/');
          setLastKeyTime(now);
        }
      } else {
        setLastKeyPressed(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lastKeyPressed, lastKeyTime]);

  // --- Render ---

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-white overflow-hidden relative">
      {/* Sidebar Overlay Trigger */}
      <div className="fixed top-4 left-4 z-50 flex flex-col items-start gap-3">
        <motion.button 
          initial={{ x: 0 }}
          animate={{ 
            x: [0, -4, 4, -4, 4, 0],
            transition: { duration: 0.4, delay: 1, repeat: 1, repeatDelay: 2 } 
          }}
          onClick={() => {
            setIsSidebarOpen(!isSidebarOpen);
            if (showTutorial) {
              setShowTutorial(false);
              localStorage.setItem('hasSeenTutorial', 'true');
            }
          }}
          className={cn(
            "flex items-center gap-2 py-2.5 px-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 hover:bg-white/20 transition-all shadow-xl",
            isSidebarOpen && "md:ml-[240px]" 
          )}
        >
          {isSidebarOpen ? <XIcon size={20} /> : <MenuIcon size={20} />}
          <span className="text-sm font-medium">{isSidebarOpen ? 'Cerrar' : 'Menu'}</span>
        </motion.button>

        {/* Tutorial Message */}
        <AnimatePresence>
          {showTutorial && !isSidebarOpen && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="ml-2 flex items-center gap-2"
            >
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <div className="bg-white/10 backdrop-blur-md border border-white/10 text-white px-4 py-2 rounded-xl shadow-xl">
                <p className="text-xs font-medium">
                  ← El botón de <span className="text-blue-400 font-bold uppercase">Menu</span> está aquí arriba
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Home Button (Top Right) */}
      <motion.button 
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => {
          setSelectedFile(null);
          setSearchQuery('');
          setNavigationPath(['root']);
        }}
        className="fixed top-4 right-4 z-50 flex items-center justify-center w-11 h-11 rounded-full bg-white/10 backdrop-blur-md border border-white/10 hover:bg-white/20 transition-all shadow-xl text-white"
        title="Ir al Inicio"
      >
        <HomeIcon size={20} />
      </motion.button>

      {/* Sidebar Panels (Overlay) */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30"
            />
            <motion.div 
              initial={{ x: -100, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -100, opacity: 0 }}
              className="fixed inset-y-0 left-0 z-40 flex overflow-x-auto bg-[#0f0f0f] border-r border-white/10 shadow-2xl scrollbar-hide max-w-[90vw]"
            >
              {navigationPath.map((folderId, index) => (
                <SidebarPanel 
                  key={`${folderId}-${index}`}
                  folderId={folderId}
                  folders={folders}
                  files={files}
                  index={index}
                  navigationPath={navigationPath}
                  setNavigationPath={setNavigationPath}
                  selectedFile={selectedFile}
                  setSelectedFile={(file) => {
                    setSelectedFile(file);
                    setIsSidebarOpen(false);
                  }}
                  isEditMode={isEditMode}
                />
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Content (Always Full Width) */}
      <main className="flex-1 flex flex-col relative bg-[#0a0a0a] w-full h-full">
        {selectedFile ? (
          <div className="flex-1 flex flex-col w-full h-full">
            <header className="h-14 border-b border-white/10 flex items-center justify-between px-6 pl-20 bg-[#0f0f0f]">
              <div className="flex items-center gap-2">
                {selectedFile.type === 'txt' ? (
                  <FileTextIcon size={18} className="text-blue-400" />
                ) : (
                  <FileCodeIcon size={18} className="text-blue-400" />
                )}
                <span className="font-medium text-sm truncate max-w-[200px] md:max-w-md">{selectedFile.name}</span>
              </div>
              <button 
                onClick={() => {
                  const isBase64 = selectedFile.content.startsWith('data:');
                  let blob: Blob;
                  
                  if (isBase64) {
                    const byteString = atob(selectedFile.content.split(',')[1]);
                    const mimeString = selectedFile.content.split(',')[0].split(':')[1].split(';')[0];
                    const ab = new ArrayBuffer(byteString.length);
                    const ia = new Uint8Array(ab);
                    for (let i = 0; i < byteString.length; i++) {
                      ia[i] = byteString.charCodeAt(i);
                    }
                    blob = new Blob([ab], { type: mimeString });
                  } else {
                    blob = new Blob([selectedFile.content], { type: selectedFile.type === 'txt' ? 'text/plain' : 'text/html' });
                  }

                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = selectedFile.name;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
                className="flex items-center gap-2 px-3 py-1.5 mr-20 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-xs font-medium"
              >
                <DownloadIcon size={14} />
                <span>Descargar</span>
              </button>
            </header>
            <div className="flex-1 bg-white overflow-hidden">
              {shortcutUrl ? (
                <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 p-8 text-center">
                  <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="max-w-md w-full p-10 bg-white rounded-[40px] shadow-2xl border border-gray-100 flex flex-col items-center gap-8"
                  >
                    <div className="w-20 h-20 rounded-3xl bg-blue-500/10 flex items-center justify-center text-blue-600">
                      <ExternalLinkIcon size={40} />
                    </div>
                    <div className="space-y-3">
                      <h3 className="text-2xl font-bold text-gray-900 tracking-tight">Acceso Directo</h3>
                      <p className="text-sm text-gray-500 leading-relaxed">
                        Este archivo contiene un enlace a una herramienta externa.
                      </p>
                    </div>
                    <a 
                      href={shortcutUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="w-full py-5 px-8 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold transition-all shadow-xl shadow-blue-600/20 flex items-center justify-center gap-3 group"
                    >
                      <span>Abrir Herramienta</span>
                      <ExternalLinkIcon size={20} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                    </a>
                    <div className="pt-4 border-t border-gray-100 w-full">
                      <p className="text-[10px] text-gray-400 font-mono break-all opacity-60">{shortcutUrl}</p>
                    </div>
                  </motion.div>
                </div>
              ) : selectedFile.type === 'xlsx' ? (
                <ExcelPreview content={selectedFile.content} />
              ) : selectedFile.type === 'txt' ? (
                <div className="w-full h-full p-8 overflow-auto bg-[#f8f9fa] text-gray-800 font-mono text-sm leading-relaxed whitespace-pre-wrap">
                  {selectedFile.content}
                </div>
              ) : (
                <iframe 
                  srcDoc={selectedFile.content}
                  className="w-full h-full border-none"
                  title={selectedFile.name}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-2xl w-full flex flex-col items-center gap-8 py-12"
            >
              {/* Logo and Title */}
              <div className="flex flex-col items-center gap-6">
                <div className="w-48 h-48 rounded-full overflow-hidden border-4 border-white/10 shadow-[0_0_50px_rgba(255,255,255,0.05)] bg-[#111] flex items-center justify-center relative group">
                  <img 
                    src="https://www.estudiodutto.com.ar/img/logoestudio.png" 
                    alt="Estudio Dutto Logo" 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      const fallback = e.currentTarget.parentElement?.querySelector('.fallback-logo');
                      if (fallback) (fallback as HTMLElement).style.display = 'flex';
                    }}
                  />
                  <div className="fallback-logo hidden absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-blue-600 to-indigo-900">
                    <span className="text-6xl font-black tracking-tighter text-white">ED</span>
                    <span className="text-[8px] font-bold uppercase tracking-[0.3em] text-white/60 mt-2">Estudio Dutto</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <h1 className="text-5xl font-bold tracking-tighter bg-gradient-to-b from-white to-white/40 bg-clip-text text-transparent">
                    Estudio Dutto
                  </h1>
                  <p className="text-gray-500 text-sm font-medium">
                    Gestión y Visualización de Herramientas
                  </p>
                </div>
              </div>

              {/* Search Bar */}
              <div className="w-full max-w-md relative group">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-400 transition-colors">
                  <SearchIcon size={18} />
                </div>
                <input 
                  type="text"
                  placeholder="Buscar documentos por nombre..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all backdrop-blur-sm"
                />
              </div>

              {/* Search Results or Welcome Message */}
              <div className="w-full max-w-md">
                {searchQuery.trim() ? (
                  <div className="space-y-2 text-left">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-4 px-2">
                      Resultados de búsqueda
                    </p>
                    <div className="grid gap-2">
                      {files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase())).length > 0 ? (
                        files
                          .filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
                          .slice(0, 5)
                          .map(file => (
                            <button
                              key={file.id}
                              onClick={() => {
                                setSelectedFile(file);
                                setSearchQuery('');
                              }}
                              className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-blue-600/20 hover:border-blue-500/30 transition-all group text-left"
                            >
                              <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                                {file.type === 'txt' ? (
                                  <FileTextIcon size={16} />
                                ) : (
                                  <FileCodeIcon size={16} />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{file.name}</p>
                                <p className="text-[10px] text-gray-500 truncate">
                                  {folders.find(f => f.id === file.folderId)?.name || 'Raíz'}
                                </p>
                              </div>
                              <ChevronRightIcon size={14} className="text-gray-600 group-hover:text-blue-400 transition-colors" />
                            </button>
                          ))
                      ) : (
                        <div className="py-8 text-center bg-white/5 rounded-2xl border border-dashed border-white/10">
                          <p className="text-sm text-gray-500">No se encontraron documentos con ese nombre.</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm font-medium">
                    Selecciona un archivo desde el menú lateral o usa el buscador para comenzar.
                  </p>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </main>

      {/* Upload Modal */}
      <AnimatePresence>
        {isUploadModalOpen && (
          <UploadModal 
            onClose={() => setIsUploadModalOpen(false)} 
            folders={folders}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Excel Preview Component ---

function ExcelPreview({ content }: { content: string }) {
  const [data, setData] = useState<any[][]>([]);
  const [sheets, setSheets] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);

  useEffect(() => {
    try {
      const base64 = content.split(',')[1];
      const workbook = XLSX.read(base64, { type: 'base64' });
      setSheets(workbook.SheetNames);
      
      const firstSheetName = workbook.SheetNames[activeSheet];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
      setData(jsonData);
    } catch (error) {
      console.error("Excel Preview Error:", error);
    }
  }, [content, activeSheet]);

  if (data.length === 0) return (
    <div className="w-full h-full flex items-center justify-center text-gray-400">
      Cargando vista previa...
    </div>
  );

  return (
    <div className="w-full h-full flex flex-col bg-white">
      <div className="flex border-b border-gray-200 bg-gray-50 overflow-x-auto">
        {sheets.map((name, idx) => (
          <button
            key={name}
            onClick={() => setActiveSheet(idx)}
            className={cn(
              "px-4 py-2 text-xs font-medium border-r border-gray-200 transition-colors whitespace-nowrap",
              activeSheet === idx ? "bg-white text-blue-600 border-b-2 border-b-blue-600" : "text-gray-500 hover:bg-gray-100"
            )}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-4">
        <table className="min-w-full border-collapse text-xs text-gray-700">
          <tbody>
            {data.map((row, rIdx) => (
              <tr key={rIdx} className="border-b border-gray-100 hover:bg-gray-50">
                {row.map((cell, cIdx) => (
                  <td key={cIdx} className="border border-gray-200 p-2 min-w-[100px]">
                    {cell?.toString() || ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- Sidebar Panel Component ---

const SidebarPanel: React.FC<SidebarPanelProps> = ({ 
  folderId, 
  folders, 
  files, 
  index, 
  navigationPath, 
  setNavigationPath,
  selectedFile,
  setSelectedFile,
  isEditMode
}) => {
  const currentFolders = folders.filter(f => f.parentId === folderId);
  const currentFiles = files.filter(f => f.folderId === folderId);
  const activeChildId = navigationPath[index + 1];

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const handleFolderClick = (id: string) => {
    if (isEditMode) return;
    const newPath = navigationPath.slice(0, index + 1);
    newPath.push(id);
    setNavigationPath(newPath);
  };

  const handleStartEdit = (e: React.MouseEvent, id: string, currentName: string) => {
    if (!isEditMode) return;
    e.stopPropagation();
    setEditingId(id);
    setEditingName(currentName);
  };

  const handleSaveEdit = async (id: string, type: 'folder' | 'file') => {
    if (!editingName.trim()) {
      setEditingId(null);
      return;
    }
    try {
      const collectionName = type === 'folder' ? 'folders' : 'htmlFiles';
      await updateDoc(doc(db, collectionName, id), { name: editingName });
    } catch (error) {
      console.error("Rename Error:", error);
    }
    setEditingId(null);
  };

  const handleDeleteFile = async (e: React.MouseEvent, fileId: string) => {
    e.stopPropagation();
    if (confirm('¿Estás seguro de que quieres eliminar este archivo?')) {
      try {
        await deleteDoc(doc(db, 'htmlFiles', fileId));
        if (selectedFile?.id === fileId) setSelectedFile(null);
      } catch (error) {
        console.error("Delete File Error:", error);
      }
    }
  };

  const handleDeleteFolder = async (e: React.MouseEvent, folder: Folder) => {
    e.stopPropagation();
    const hasContents = folders.some(f => f.parentId === folder.id) || files.some(f => f.folderId === folder.id);
    
    if (hasContents) {
      alert('No se puede eliminar una carpeta que contiene archivos o subcarpetas. Elimina primero su contenido.');
      return;
    }

    if (confirm(`¿Estás seguro de que quieres eliminar la carpeta "${folder.name}"?`)) {
      try {
        await deleteDoc(doc(db, 'folders', folder.id));
        // Reset navigation path if deleted folder was active
        if (navigationPath.includes(folder.id)) {
          setNavigationPath(navigationPath.slice(0, index + 1));
        }
      } catch (error) {
        console.error("Delete Folder Error:", error);
      }
    }
  };

  return (
    <motion.div 
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 240, opacity: 1 }}
      className="flex-shrink-0 w-60 border-r border-white/10 flex flex-col bg-[#0f0f0f]"
    >
      <div className="p-4 border-b border-white/10 bg-[#141414]/50 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">
          {index === 0 ? <SearchIcon size={12} /> : <FolderIcon size={12} />}
          <span>{index === 0 ? 'Biblioteca' : folders.find(f => f.id === folderId)?.name}</span>
        </div>
        {isEditMode && (
          <div className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-500 text-[8px] font-bold uppercase tracking-tighter border border-red-500/30">
            Editando
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {currentFolders.length === 0 && currentFiles.length === 0 && (
          <div className="py-8 text-center text-xs text-gray-600 italic">
            Vacío
          </div>
        )}
        
        {currentFolders.map(folder => (
          <button 
            key={folder.id}
            onClick={() => handleFolderClick(folder.id)}
            className={cn(
              "w-full flex items-center justify-between py-2 px-3 rounded-xl transition-all text-sm group",
              activeChildId === folder.id 
                ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30" 
                : "text-gray-300 hover:bg-white/5 border border-transparent",
              isEditMode && "cursor-default"
            )}
          >
            <div className="flex items-center gap-3 truncate flex-1 min-w-0">
              <FolderIcon size={16} className={cn(activeChildId === folder.id ? "text-yellow-400" : "text-yellow-500/70")} />
              {editingId === folder.id ? (
                <input
                  autoFocus
                  className="bg-black/40 border border-yellow-500/50 rounded px-1 py-0.5 w-full text-xs text-white outline-none"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={() => handleSaveEdit(folder.id, 'folder')}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(folder.id, 'folder')}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span 
                  className="truncate"
                  onClick={(e) => handleStartEdit(e, folder.id, folder.name)}
                >
                  {folder.name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {isEditMode ? (
                <button 
                  onClick={(e) => handleDeleteFolder(e, folder)}
                  className="p-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all"
                >
                  <Trash2Icon size={12} />
                </button>
              ) : (
                <ChevronRightIcon size={14} className={cn("flex-shrink-0", activeChildId === folder.id ? "opacity-100" : "opacity-40")} />
              )}
            </div>
          </button>
        ))}

        {currentFiles.map(file => (
          <div 
            key={file.id}
            className="group relative"
          >
            <button 
              onClick={() => {
                if (!isEditMode) {
                  const url = getShortcutUrl(file.content);
                  if (url) {
                    window.open(url, '_blank');
                  }
                  setSelectedFile(file);
                }
              }}
              className={cn(
                "w-full flex items-center gap-3 py-2 px-3 rounded-xl transition-all text-sm group border",
                selectedFile?.id === file.id 
                  ? "bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-600/20" 
                  : "bg-blue-500/10 text-blue-100 border-blue-500/20 hover:bg-blue-500/20",
                isEditMode && "cursor-default pr-10"
              )}
            >
              <div className="flex items-center gap-3 truncate flex-1 min-w-0">
                {file.type === 'txt' ? (
                  <FileTextIcon size={16} className={cn(selectedFile?.id === file.id ? "text-white" : "text-blue-400")} />
                ) : (
                  <FileCodeIcon size={16} className={cn(selectedFile?.id === file.id ? "text-white" : "text-blue-400")} />
                )}
                {editingId === file.id ? (
                  <input
                    autoFocus
                    className="bg-black/40 border border-blue-400/50 rounded px-1 py-0.5 w-full text-xs text-white outline-none"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={() => handleSaveEdit(file.id, 'file')}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(file.id, 'file')}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span 
                    className="truncate font-semibold"
                    onClick={(e) => handleStartEdit(e, file.id, file.name)}
                  >
                    {file.name}
                  </span>
                )}
              </div>
            </button>
            
            {isEditMode && (
              <button 
                onClick={(e) => handleDeleteFile(e, file.id)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all z-10"
              >
                <Trash2Icon size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// --- Upload Modal Component ---

function UploadModal({ onClose, folders }: { onClose: () => void, folders: Folder[] }) {
  const [step, setStep] = useState<'upload' | 'classify'>('upload');
  const [file, setFile] = useState<{ name: string, content: string, type: 'html' | 'txt' | 'xlsx' } | null>(null);
  const [path, setPath] = useState<string>(''); // e.g. "Bancos/Macro"
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const isExcel = selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls');
    const isTxt = selectedFile.name.endsWith('.txt');
    const fileType = isExcel ? 'xlsx' : (isTxt ? 'txt' : 'html');

    const reader = new FileReader();
    reader.onload = (event) => {
      setFile({
        name: selectedFile.name,
        content: event.target?.result as string,
        type: fileType
      });
      setStep('classify');
    };

    if (isExcel) {
      reader.readAsDataURL(selectedFile);
    } else {
      reader.readAsText(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file || !path) return;
    setIsUploading(true);

    try {
      // 1. Parse path and create folders if they don't exist
      const pathParts = path.split('/').filter(p => p.trim() !== '');
      let currentParentId = 'root';

      for (const part of pathParts) {
        // Check if folder exists under current parent
        const existing = folders.find(f => f.name.toLowerCase() === part.toLowerCase() && f.parentId === currentParentId);
        
        if (existing) {
          currentParentId = existing.id;
        } else {
          // Create new folder
          const newFolderRef = await addDoc(collection(db, 'folders'), {
            name: part,
            parentId: currentParentId,
            userId: 'public'
          });
          currentParentId = newFolderRef.id;
        }
      }

      // 2. Upload file to the final folder
      await addDoc(collection(db, 'htmlFiles'), {
        name: file.name,
        content: file.content,
        type: file.type,
        folderId: currentParentId,
        userId: 'public',
        createdAt: new Date().toISOString()
      });

      onClose();
    } catch (error) {
      console.error("Upload Error:", error);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-[#141414] border border-white/10 w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Cargar Archivo</h2>
          <button onClick={onClose} className="p-1 hover:bg-white/5 rounded-full">
            <XIcon size={20} />
          </button>
        </div>

        <div className="p-8">
          {step === 'upload' ? (
            <div className="space-y-6">
              <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-white/10 rounded-2xl hover:border-blue-500/50 hover:bg-blue-500/5 transition-all cursor-pointer group">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <UploadIcon className="w-10 h-10 mb-4 text-gray-500 group-hover:text-blue-400 transition-colors" />
                  <p className="mb-2 text-sm text-gray-400">
                    <span className="font-semibold">Haz clic para subir</span> o arrastra y suelta
                  </p>
                  <p className="text-xs text-gray-500">Archivos .html, .txt, .url o .xlsx</p>
                </div>
                <input type="file" className="hidden" accept=".html,.txt,.url,.xlsx,.xls" onChange={handleFileChange} />
              </label>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-400">Archivo seleccionado</label>
                <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5">
                  {file?.type === 'txt' ? (
                    <FileTextIcon size={20} className="text-blue-400" />
                  ) : file?.type === 'xlsx' ? (
                    <TableIcon size={20} className="text-green-400" />
                  ) : (
                    <FileCodeIcon size={20} className="text-blue-400" />
                  )}
                  <span className="text-sm truncate">{file?.name}</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-400">Clasificación (Ruta)</label>
                <div className="relative">
                  <input 
                    type="text" 
                    placeholder="Ej: Bancos/Macro"
                    value={path}
                    onChange={e => setPath(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                    autoFocus
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-500 font-mono">
                    PATH
                  </div>
                </div>
                <p className="text-[10px] text-gray-500 px-1">
                  Usa "/" para crear subcarpetas. Si no existen, se crearán automáticamente.
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  onClick={() => setStep('upload')}
                  className="flex-1 py-3 px-4 rounded-xl border border-white/10 text-sm font-medium hover:bg-white/5 transition-colors"
                >
                  Atrás
                </button>
                <button 
                  onClick={handleUpload}
                  disabled={!path || isUploading}
                  className="flex-[2] py-3 px-4 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                >
                  {isUploading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <PlusIcon size={18} />
                  )}
                  {isUploading ? 'Subiendo...' : 'Guardar y Clasificar'}
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
