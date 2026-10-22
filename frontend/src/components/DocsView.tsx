'use client';

import React, { useState, useRef } from 'react';
import {
  FileText,
  Plus,
  BookOpen,
  Search,
  Save,
  CheckCircle2,
  Upload,
  Download,
  Trash2,
  FileCode,
  FileSpreadsheet,
  FileImage,
  FolderOpen,
  Users,
  Eye,
  Paperclip,
  Clock,
  Sparkles,
  Share2,
  ExternalLink
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';

interface DocsViewProps {
  projectId: string;
}

interface ProjectDoc {
  id: string;
  title: string;
  category: string;
  author: string;
  updatedAt: string;
  content: string;
}

interface ProjectFile {
  id: string;
  name: string;
  size: string;
  type: string;
  author: string;
  uploadedAt: string;
  url?: string;
}

export const DocsView: React.FC<DocsViewProps> = ({ projectId }) => {
  const { user } = useAuthStore();
  const userName = user?.name || user?.email?.split('@')[0] || 'Team Member';

  const [activeTab, setActiveTab] = useState<'docs' | 'files'>('docs');
  const [activeDocId, setActiveDocId] = useState('doc-1');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Written Project Documents
  const [docs, setDocs] = useState<ProjectDoc[]>([
    {
      id: 'doc-1',
      title: 'Project Architecture & Standards',
      category: 'Architecture',
      author: 'Admin',
      updatedAt: 'Today at 11:20 AM',
      content: `# Project Architecture & Standards

## 1. Overview
This project follows an ultra-performant full-stack architecture built for high concurrency and real-time team synchronization.

## 2. Team Workflow & Personas
- **Project Leads / Managers**: Define milestones, manage sprints, and allocate team issues.
- **Developers / Engineers**: Pick up tasks from the Sprint Board, link commits, and move cards across workflow stages.
- **Stakeholders / Members**: Review progress summaries, shared project docs, and analytics.

## 3. Contribution Guidelines
- Ensure all API endpoints are properly authorized.
- Add descriptive bug tags and priority before starting tasks.
- Keep project documentation and requirements updated in this Docs workspace.`
    },
    {
      id: 'doc-2',
      title: 'Sprint 1 Retrospective & Action Items',
      category: 'Planning',
      author: 'Project Lead',
      updatedAt: 'Yesterday',
      content: `# Sprint 1 Retrospective

### What Went Well:
- Delivered core authentication, profile management, and workspace scoping.
- High velocity on sprint board drag-and-drop tasks.
- Fast real-time WebSockets synchronization across active tabs.

### Next Steps:
- Complete sprint 1 and roll remaining tasks to next sprint.
- Refine report widgets and team metric dashboards.`
    },
    {
      id: 'doc-3',
      title: 'API Specification & Data Contracts',
      category: 'Engineering',
      author: 'Tech Lead',
      updatedAt: '2 days ago',
      content: `# API Specification & Data Contracts

### Authentication:
- Bearer JWT token in \`Authorization\` header.

### Endpoints:
- \`GET /api/projects/:id\` - Fetch project details and members.
- \`GET /api/tasks/kanban\` - Live sprint board tasks by status.
- \`POST /api/tasks\` - Create new issue/task.`
    }
  ]);

  // Uploaded Files / Document Attachments
  const [files, setFiles] = useState<ProjectFile[]>([
    {
      id: 'file-1',
      name: 'System_Design_Diagram_v2.pdf',
      size: '2.4 MB',
      type: 'pdf',
      author: 'Tech Lead',
      uploadedAt: 'Today at 10:15 AM'
    },
    {
      id: 'file-2',
      name: 'Q3_Milestone_Budget_Spreadsheet.xlsx',
      size: '850 KB',
      type: 'spreadsheet',
      author: 'Admin',
      uploadedAt: 'Yesterday'
    },
    {
      id: 'file-3',
      name: 'UI_Brand_Design_Tokens.json',
      size: '14 KB',
      type: 'code',
      author: 'Designer',
      uploadedAt: '3 days ago'
    }
  ]);

  const activeDoc = docs.find((d) => d.id === activeDocId) || docs[0];
  const [activeContent, setActiveContent] = useState(activeDoc?.content || '');
  const [activeTitle, setActiveTitle] = useState(activeDoc?.title || '');
  const [activeCategory, setActiveCategory] = useState(activeDoc?.category || 'General');

  const handleSelectDoc = (doc: ProjectDoc) => {
    setActiveDocId(doc.id);
    setActiveTitle(doc.title);
    setActiveCategory(doc.category);
    setActiveContent(doc.content);
    setIsSaved(false);
  };

  const handleSaveDoc = () => {
    setDocs(
      docs.map((d) =>
        d.id === activeDocId
          ? {
              ...d,
              title: activeTitle,
              category: activeCategory,
              content: activeContent,
              author: userName,
              updatedAt: 'Just now'
            }
          : d
      )
    );
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleCreateNewDoc = () => {
    const newDoc: ProjectDoc = {
      id: `doc-${Date.now()}`,
      title: 'Untitled Document',
      category: 'General',
      author: userName,
      updatedAt: 'Just now',
      content: '# New Project Document\n\nWrite project specifications, meeting notes, or architecture plans here. All team members will be able to view this.'
    };
    setDocs([newDoc, ...docs]);
    handleSelectDoc(newDoc);
  };

  const handleDeleteDoc = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (docs.length <= 1) return;
    const remaining = docs.filter((d) => d.id !== id);
    setDocs(remaining);
    if (activeDocId === id) {
      handleSelectDoc(remaining[0]);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles || uploadedFiles.length === 0) return;

    const newFiles: ProjectFile[] = Array.from(uploadedFiles).map((file, idx) => {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      let type = 'file';
      if (['pdf'].includes(ext)) type = 'pdf';
      else if (['xlsx', 'xls', 'csv'].includes(ext)) type = 'spreadsheet';
      else if (['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(ext)) type = 'image';
      else if (['json', 'js', 'ts', 'tsx', 'html', 'css', 'py'].includes(ext)) type = 'code';

      const sizeStr =
        file.size > 1024 * 1024
          ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
          : `${Math.round(file.size / 1024)} KB`;

      return {
        id: `file-${Date.now()}-${idx}`,
        name: file.name,
        size: sizeStr,
        type,
        author: userName,
        uploadedAt: 'Just now',
        url: URL.createObjectURL(file)
      };
    });

    setFiles([...newFiles, ...files]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeleteFile = (id: string) => {
    setFiles(files.filter((f) => f.id !== id));
  };

  const filteredDocs = docs.filter(
    (d) =>
      d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredFiles = files.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'pdf':
        return <FileText className="w-5 h-5 text-red-500" />;
      case 'spreadsheet':
        return <FileSpreadsheet className="w-5 h-5 text-emerald-600" />;
      case 'image':
        return <FileImage className="w-5 h-5 text-blue-500" />;
      case 'code':
        return <FileCode className="w-5 h-5 text-indigo-500" />;
      default:
        return <Paperclip className="w-5 h-5 text-slate-500" />;
    }
  };

  return (
    <div className="flex flex-col gap-4 text-[#111827]">
      {/* Top Banner: Visibility across All Personas */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900">Project Knowledge & Documents</h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Users className="w-3 h-3" /> Shared with all project members
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Insert specifications, upload project documents, and collaborate across all team personas.
            </p>
          </div>
        </div>

        {/* View Mode Toggle: Docs vs Files */}
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              onClick={() => setActiveTab('docs')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'docs'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Project Docs ({docs.length})</span>
            </button>
            {/* Files & Uploads tab commented out for now */}
            {/*
            <button
              onClick={() => setActiveTab('files')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'files'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Files & Uploads ({files.length})</span>
            </button>
            */}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === 'docs' ? (
        <div className="flex flex-col lg:flex-row gap-5 h-[calc(100vh-240px)]">
          {/* Docs Sidebar */}
          <div className="w-full lg:w-80 bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3 shrink-0 shadow-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Documentation ({filteredDocs.length})
                </h3>
              </div>
              <button
                onClick={handleCreateNewDoc}
                className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Doc</span>
              </button>
            </div>

            {/* Search Docs */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 focus:bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-500 transition-all font-medium"
              />
            </div>

            {/* Docs List */}
            <div className="flex flex-col gap-1.5 overflow-y-auto flex-1 min-h-0">
              {filteredDocs.map((d) => (
                <div
                  key={d.id}
                  onClick={() => handleSelectDoc(d)}
                  className={`group p-2.5 rounded-xl text-xs transition-all cursor-pointer flex items-center justify-between border ${
                    activeDocId === d.id
                      ? 'bg-blue-50/80 border-blue-200 text-blue-900 font-medium shadow-2xs'
                      : 'border-transparent hover:bg-slate-50 text-slate-700 hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <FileText className={`w-4 h-4 mt-0.5 shrink-0 ${activeDocId === d.id ? 'text-blue-600' : 'text-slate-400'}`} />
                    <div className="truncate">
                      <p className="truncate text-xs font-semibold">{d.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                        <span>{d.category}</span>
                        <span>•</span>
                        <span>{d.author}</span>
                      </div>
                    </div>
                  </div>

                  {docs.length > 1 && (
                    <button
                      onClick={(e) => handleDeleteDoc(d.id, e)}
                      title="Delete document"
                      className="p-1 hover:bg-red-50 hover:text-red-600 text-slate-300 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer ml-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Doc Editor Area */}
          <div className="flex-1 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between pb-3 border-b border-slate-200 gap-3">
              <div className="flex-1 min-w-[200px]">
                <input
                  type="text"
                  value={activeTitle}
                  onChange={(e) => setActiveTitle(e.target.value)}
                  placeholder="Document Title..."
                  className="text-base font-bold text-slate-900 bg-transparent outline-none w-full border-b border-transparent focus:border-blue-500 transition-colors"
                />
                <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" /> Author: <strong className="text-slate-600 font-semibold">{activeDoc?.author || userName}</strong>
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {activeDoc?.updatedAt || 'Just now'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsPreviewMode(!isPreviewMode)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                    isPreviewMode
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{isPreviewMode ? 'Edit Mode' : 'Preview'}</span>
                </button>

                <button
                  onClick={handleSaveDoc}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-semibold rounded-lg shadow-xs transition-all cursor-pointer shrink-0"
                >
                  {isSaved ? <CheckCircle2 className="w-3.5 h-3.5 text-white" /> : <Save className="w-3.5 h-3.5" />}
                  <span>{isSaved ? 'Saved!' : 'Save Document'}</span>
                </button>
              </div>
            </div>

            {isPreviewMode ? (
              <div className="prose prose-slate max-w-none p-4 bg-slate-50/50 rounded-xl border border-slate-200 text-xs leading-relaxed overflow-y-auto flex-1 min-h-0 whitespace-pre-wrap font-sans">
                {activeContent}
              </div>
            ) : (
              <textarea
                rows={18}
                value={activeContent}
                onChange={(e) => setActiveContent(e.target.value)}
                placeholder="Write markdown documentation, guidelines, or architectural specifications here..."
                className="w-full flex-1 bg-slate-50/70 border border-slate-200 rounded-xl p-4 text-xs font-mono text-slate-800 outline-none focus:bg-white focus:border-blue-500 resize-none leading-relaxed transition-colors"
              />
            )}
          </div>
        </div>
      ) : (
        /* Files & Document Attachments View */
        <div className="flex flex-col gap-4">
          {/* Upload Drop Zone Card */}
          <div className="bg-white border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl p-6 text-center transition-colors shadow-2xs">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileUpload}
              className="hidden"
              id="doc-file-upload"
            />
            <label
              htmlFor="doc-file-upload"
              className="flex flex-col items-center justify-center gap-2 cursor-pointer"
            >
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-xs">
                <Upload className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-800">
                Click to upload or drag and drop project documents
              </p>
              <p className="text-xs text-slate-400">
                Supports PDF, Excel (.xlsx), Word, Images, JSON, and Code specs (Max 50MB per file)
              </p>
              <span className="mt-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors">
                Select Files to Insert
              </span>
            </label>
          </div>

          {/* Files Grid / List */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col gap-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Shared Project Files ({filteredFiles.length})
                </h3>
              </div>
              <span className="text-[11px] text-slate-400">
                Accessible by all team members
              </span>
            </div>

            {filteredFiles.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Paperclip className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-xs font-medium">No documents uploaded yet</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Upload project files above to share them with the entire team.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredFiles.map((f) => (
                  <div
                    key={f.id}
                    className="p-3.5 bg-slate-50 hover:bg-white border border-slate-200 rounded-xl transition-all flex flex-col justify-between gap-3 group shadow-2xs hover:shadow-xs"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-2xs">
                        {getFileIcon(f.type)}
                      </div>
                      <div className="truncate flex-1">
                        <h4 className="text-xs font-semibold text-slate-800 truncate" title={f.name}>
                          {f.name}
                        </h4>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {f.size} • Uploaded by <strong className="text-slate-600">{f.author}</strong>
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {f.uploadedAt}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/60">
                      <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/80">
                        Visible to all personas
                      </span>
                      <div className="flex items-center gap-1">
                        {f.url ? (
                          <a
                            href={f.url}
                            download={f.name}
                            className="p-1.5 hover:bg-blue-50 text-slate-500 hover:text-blue-600 rounded-md transition-colors cursor-pointer"
                            title="Download Document"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        ) : (
                          <button
                            onClick={() => alert(`Opening ${f.name} for all project members`)}
                            className="p-1.5 hover:bg-blue-50 text-slate-500 hover:text-blue-600 rounded-md transition-colors cursor-pointer"
                            title="Download / Open"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteFile(f.id)}
                          className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-md transition-colors cursor-pointer"
                          title="Remove file"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
