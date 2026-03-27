/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
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
  MenuIcon
} from 'lucide-react';
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
  getDocs
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

// --- Types ---

interface Folder {
  id: string;
  name: string;
  parentId: string;
  userId: string;
}

interface HtmlFile {
  id: string;
  name: string;
  content: string;
  folderId: string;
  userId: string;
  createdAt: string;
}

// --- Components ---

export default function App() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<HtmlFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<HtmlFile | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [lastKeyPressed, setLastKeyPressed] = useState<string | null>(null);
  const [lastKeyTime, setLastKeyTime] = useState<number>(0);
  const [navigationPath, setNavigationPath] = useState<string[]>(['root']);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

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
      const fileData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as HtmlFile));
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
      if (e.key === '*') {
        const now = Date.now();
        if (lastKeyPressed === '*' && now - lastKeyTime < 500) {
          setIsUploadModalOpen(true);
          setLastKeyPressed(null);
        } else {
          setLastKeyPressed('*');
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
                <FileCodeIcon size={18} className="text-blue-400" />
                <span className="font-medium text-sm truncate max-w-[200px] md:max-w-md">{selectedFile.name}</span>
              </div>
            </header>
            <div className="flex-1 bg-white">
              <iframe 
                srcDoc={selectedFile.content}
                className="w-full h-full border-none"
                title={selectedFile.name}
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-sm flex flex-col items-center gap-8"
            >
              <div className="w-64 h-64 rounded-full overflow-hidden border-4 border-white/10 shadow-[0_0_50px_rgba(255,255,255,0.05)] bg-[#111] flex items-center justify-center relative group">
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
                  <span className="text-7xl font-black tracking-tighter text-white">ED</span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/60 mt-2">Estudio Dutto</span>
                </div>
              </div>
              <div className="space-y-3">
                <h1 className="text-5xl font-bold tracking-tighter bg-gradient-to-b from-white to-white/40 bg-clip-text text-transparent">
                  Estudio Dutto
                </h1>
                <p className="text-gray-500 text-sm font-medium">
                  Selecciona un archivo desde el menú lateral para comenzar a visualizar tus documentos.
                </p>
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

// --- Sidebar Panel Component ---

function SidebarPanel({ 
  folderId, 
  folders, 
  files, 
  index, 
  navigationPath, 
  setNavigationPath,
  selectedFile,
  setSelectedFile
}: { 
  folderId: string, 
  folders: Folder[], 
  files: HtmlFile[], 
  index: number,
  navigationPath: string[],
  setNavigationPath: (path: string[]) => void,
  selectedFile: HtmlFile | null,
  setSelectedFile: (file: HtmlFile) => void
}) {
  const currentFolders = folders.filter(f => f.parentId === folderId);
  const currentFiles = files.filter(f => f.folderId === folderId);
  const activeChildId = navigationPath[index + 1];

  const handleFolderClick = (id: string) => {
    const newPath = navigationPath.slice(0, index + 1);
    newPath.push(id);
    setNavigationPath(newPath);
  };

  return (
    <motion.div 
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 240, opacity: 1 }}
      className="flex-shrink-0 w-60 border-r border-white/10 flex flex-col bg-[#0f0f0f]"
    >
      <div className="p-4 border-b border-white/10 bg-[#141414]/50">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">
          {index === 0 ? <SearchIcon size={12} /> : <FolderIcon size={12} />}
          <span>{index === 0 ? 'Biblioteca' : folders.find(f => f.id === folderId)?.name}</span>
        </div>
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
                : "text-gray-300 hover:bg-white/5 border border-transparent"
            )}
          >
            <div className="flex items-center gap-3 truncate">
              <FolderIcon size={16} className={cn(activeChildId === folder.id ? "text-yellow-400" : "text-yellow-500/70")} />
              <span className="truncate">{folder.name}</span>
            </div>
            <ChevronRightIcon size={14} className={cn("flex-shrink-0", activeChildId === folder.id ? "opacity-100" : "opacity-40")} />
          </button>
        ))}

        {currentFiles.map(file => (
          <button 
            key={file.id}
            onClick={() => setSelectedFile(file)}
            className={cn(
              "w-full flex items-center gap-3 py-2 px-3 rounded-xl transition-all text-sm group border",
              selectedFile?.id === file.id 
                ? "bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-600/20" 
                : "bg-blue-500/10 text-blue-100 border-blue-500/20 hover:bg-blue-500/20"
            )}
          >
            <FileCodeIcon size={16} className={cn(selectedFile?.id === file.id ? "text-white" : "text-blue-400")} />
            <span className="truncate font-semibold">{file.name}</span>
          </button>
        ))}
      </div>
    </motion.div>
  );
}

// --- Upload Modal Component ---

function UploadModal({ onClose, folders }: { onClose: () => void, folders: Folder[] }) {
  const [step, setStep] = useState<'upload' | 'classify'>('upload');
  const [file, setFile] = useState<{ name: string, content: string } | null>(null);
  const [path, setPath] = useState<string>(''); // e.g. "Bancos/Macro"
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setFile({
        name: selectedFile.name,
        content: event.target?.result as string
      });
      setStep('classify');
    };
    reader.readAsText(selectedFile);
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
          <h2 className="text-xl font-semibold">Cargar Archivo HTML</h2>
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
                  <p className="text-xs text-gray-500">Solo archivos .html</p>
                </div>
                <input type="file" className="hidden" accept=".html" onChange={handleFileChange} />
              </label>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-400">Archivo seleccionado</label>
                <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5">
                  <FileCodeIcon size={20} className="text-blue-400" />
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
