import React, { useState, useEffect, useCallback } from 'react';
import { 
  Search, TrendingUp, Clock, Zap, FileText, 
  DollarSign, AlertCircle, CheckCircle, XCircle, Settings, 
  Plus, Trash2, Edit, RefreshCw, Wifi, WifiOff, ExternalLink, 
  Copy, Bookmark, Star, Shield, User, MapPin, Send, Users,
  ThumbsUp, Eye, PenTool, Download, HelpCircle, BarChart3, Target
} from 'lucide-react';
import { API_URL, DEFAULT_OFFERINGS, DEFAULT_PROPOSAL_TEMPLATE, parseApifyJob } from './config';

function App() {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [generatingProposal, setGeneratingProposal] = useState(false);
  const [proposals, setProposals] = useState({});
  const [loading, setLoading] = useState(false);
  const [proxyStatus, setProxyStatus] = useState('checking');
  const [lastRefresh, setLastRefresh] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  
  const [activeTab, setActiveTab] = useState('projects'); // 'projects' or 'skills'
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [locationFilter, setLocationFilter] = useState('all');
  
  const [showSettings, setShowSettings] = useState(false);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [editingOffering, setEditingOffering] = useState(null);
  
  const [savedProjects, setSavedProjects] = useState(() => {
    try { return JSON.parse(localStorage.getItem('upwork_saved_projects')) || []; } catch { return []; }
  });
  
  const [appliedProjects, setAppliedProjects] = useState(() => {
    try { return JSON.parse(localStorage.getItem('upwork_applied_projects')) || []; } catch { return []; }
  });
  
  const [teamNotes, setTeamNotes] = useState(() => {
    try { return JSON.parse(localStorage.getItem('upwork_team_notes')) || {}; } catch { return {}; }
  });
  
  const [offerings, setOfferings] = useState(() => {
    try { return JSON.parse(localStorage.getItem('upwork_offerings_v2')) || DEFAULT_OFFERINGS; } catch { return DEFAULT_OFFERINGS; }
  });
  
  const [proposalTemplate, setProposalTemplate] = useState(() => {
    try { return localStorage.getItem('upwork_proposal_template') || DEFAULT_PROPOSAL_TEMPLATE; } catch { return DEFAULT_PROPOSAL_TEMPLATE; }
  });
  
  const [userName, setUserName] = useState(() => {
    try { return localStorage.getItem('upwork_user_name') || 'Team Member'; } catch { return 'Team Member'; }
  });

  useEffect(() => { localStorage.setItem('upwork_offerings_v2', JSON.stringify(offerings)); }, [offerings]);
  useEffect(() => { localStorage.setItem('upwork_saved_projects', JSON.stringify(savedProjects)); }, [savedProjects]);
  useEffect(() => { localStorage.setItem('upwork_applied_projects', JSON.stringify(appliedProjects)); }, [appliedProjects]);
  useEffect(() => { localStorage.setItem('upwork_team_notes', JSON.stringify(teamNotes)); }, [teamNotes]);
  useEffect(() => { localStorage.setItem('upwork_proposal_template', proposalTemplate); }, [proposalTemplate]);
  useEffect(() => { localStorage.setItem('upwork_user_name', userName); }, [userName]);

  // Skills Gap Analysis
  const analyzeSkillsGap = () => {
    const realProjects = projects.filter(p => !p.isInstruction);
    const allOurSkills = offerings.flatMap(o => o.skills || []).map(s => s.toLowerCase());
    const uniqueOurSkills = [...new Set(allOurSkills)];
    
    // Count skill demand from projects
    const skillDemand = {};
    const skillProjects = {};
    
    realProjects.forEach(project => {
      (project.skills || []).forEach(skill => {
        const skillLower = skill.toLowerCase();
        skillDemand[skillLower] = (skillDemand[skillLower] || 0) + 1;
        if (!skillProjects[skillLower]) skillProjects[skillLower] = [];
        skillProjects[skillLower].push(project.title);
      });
    });
    
    // Categorize skills
    const matched = [];
    const missing = [];
    
    Object.keys(skillDemand).forEach(skill => {
      const hasSkill = uniqueOurSkills.some(os => os.includes(skill) || skill.includes(os));
      const entry = {
        skill: skill.charAt(0).toUpperCase() + skill.slice(1),
        demand: skillDemand[skill],
        projects: skillProjects[skill] || [],
        percentage: Math.round((skillDemand[skill] / realProjects.length) * 100)
      };
      
      if (hasSkill) {
        matched.push(entry);
      } else {
        missing.push(entry);
      }
    });
    
    // Sort by demand
    matched.sort((a, b) => b.demand - a.demand);
    missing.sort((a, b) => b.demand - a.demand);
    
    // Calculate coverage
    const totalDemand = Object.values(skillDemand).reduce((a, b) => a + b, 0);
    const coveredDemand = matched.reduce((sum, s) => sum + s.demand, 0);
    const coverage = totalDemand > 0 ? Math.round((coveredDemand / totalDemand) * 100) : 0;
    
    // Potential revenue impact
    const avgProjectValue = realProjects.reduce((sum, p) => {
      const off = offerings.find(o => o.name === p.category);
      const avgRate = off ? (off.rateMin + off.rateMax) / 2 : 100;
      return sum + ((p.estimatedHours || 20) * avgRate);
    }, 0) / (realProjects.length || 1);
    
    const missedRevenue = missing.reduce((sum, s) => sum + (s.demand * avgProjectValue * 0.3), 0);
    
    return { matched, missing, coverage, totalProjects: realProjects.length, missedRevenue, uniqueOurSkills };
  };

  const addSkillToCategory = (skill, categoryIndex) => {
    const updated = [...offerings];
    if (!updated[categoryIndex].skills) updated[categoryIndex].skills = [];
    if (!updated[categoryIndex].skills.some(s => s.toLowerCase() === skill.toLowerCase())) {
      updated[categoryIndex].skills.push(skill);
      setOfferings(updated);
    }
  };

  const checkProxyStatus = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(API_URL, { signal: controller.signal });
      clearTimeout(timeoutId);
      setProxyStatus(response.ok ? 'online' : 'offline');
      return response.ok;
    } catch { setProxyStatus('offline'); return false; }
  }, []);

  const fetchProjects = async () => {
    setLoading(true);
    const isOnline = await checkProxyStatus();
    if (!isOnline) {
      setProjects([{ id: 'offline', title: '🔌 Backend Offline', description: `Cannot connect to ${API_URL}.`, link: 'https://upwork.com', postedDate: new Date(), category: 'System', budget: 'N/A', matchScore: 0, isInstruction: true }]);
      setLoading(false);
      return;
    }
    try {
      const allKeywords = offerings.flatMap(o => o.keywords.slice(0, 2));
      const uniqueKeywords = [...new Set(allKeywords)].slice(0, 10);
      const response = await fetch(`${API_URL}/api/upwork/batch`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: uniqueKeywords, limit: 100 })
      });
      const data = await response.json();
      if (data.success && data.jobs?.length > 0) {
        const parsed = new Map();
        data.jobs.forEach(job => {
          const offering = offerings.find(o => o.keywords.some(kw => (job.title || '').toLowerCase().includes(kw.toLowerCase()) || (job.description || '').toLowerCase().includes(kw.toLowerCase()))) || offerings[0];
          const p = parseApifyJob(job, '', offering);
          if (!parsed.has(p.id)) parsed.set(p.id, p);
        });
        setProjects(Array.from(parsed.values()));
        setLastRefresh(new Date());
      } else {
        setProjects([{ id: 'no-results', title: '📭 No Projects Found', description: data.error || 'Wait 30-60 seconds and refresh.', link: 'https://upwork.com', postedDate: new Date(), category: 'System', budget: 'N/A', matchScore: 0, isInstruction: true }]);
      }
    } catch (err) {
      setProjects([{ id: 'error', title: '❌ Error', description: err.message, link: 'https://upwork.com', postedDate: new Date(), category: 'System', budget: 'N/A', matchScore: 0, isInstruction: true }]);
    }
    setLoading(false);
  };

  const generateProposal = async (project) => {
    setGeneratingProposal(true);
    const offering = offerings.find(o => o.name === project.category) || offerings[0];
    
    try {
      const response = await fetch(`${API_URL}/api/generate-proposal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project, offering, allOfferings: offerings, template: proposalTemplate })
      });
      const data = await response.json();
      if (data.error && !data.analysis) throw new Error(data.error);
      setProposals(prev => ({ ...prev, [project.id]: { proposal: data.proposal || 'Proposal generation failed.', analysis: data.analysis || {}, offering, generatedAt: new Date() } }));
    } catch (error) {
      setProposals(prev => ({ ...prev, [project.id]: { proposal: `Error: ${error.message}`, analysis: { projectSummary: 'Error', estimatedHours: project.estimatedHours || 20, complexity: 'Unknown', confidenceScore: 0, confidenceBreakdown: ['Error'], skillsMatched: [], skillsMissing: project.skills || [], recommendation: 'REVIEW', recommendationReason: error.message, keyDeliverables: [], risks: ['Analysis failed'], timeline: 'TBD' }, offering, generatedAt: new Date() } }));
    }
    setGeneratingProposal(false);
  };

  const exportToCSV = (project, proposalData) => {
    const analysis = proposalData.analysis || {};
    const csvContent = `Field,Value\nProject Title,"${project.title?.replace(/"/g, '""')}"\nClient Budget,"${project.budget}"\nAI Recommendation,"${analysis.recommendation || 'N/A'}"\nConfidence Score,"${analysis.confidenceScore || 0}%"\nEstimated Hours,"${analysis.estimatedHours || 'N/A'}"\nTotal Estimate,"$${analysis.totalEstimateMin?.toLocaleString() || 0}-$${analysis.totalEstimateMax?.toLocaleString() || 0}"\nSkills We Have,"${(analysis.skillsMatched || []).join(', ')}"\nSkills Missing,"${(analysis.skillsMissing || []).join(', ')}"\nTimeline,"${analysis.timeline || 'N/A'}"\n\nPROPOSAL:\n"${(proposalData.proposal || '').replace(/"/g, '""')}"`;
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `proposal_${project.title?.slice(0, 30).replace(/[^a-z0-9]/gi, '_') || 'project'}.csv`;
    link.click();
  };

  const copyProposal = async (text, id) => { await navigator.clipboard.writeText(text); setCopiedId(id); setTimeout(() => setCopiedId(null), 2000); };
  const toggleSave = (project) => { setSavedProjects(prev => prev.some(p => p.id === project.id) ? prev.filter(p => p.id !== project.id) : [...prev, { ...project, savedAt: new Date(), savedBy: userName }]); };
  const toggleApplied = (project) => { setAppliedProjects(prev => prev.some(p => p.id === project.id) ? prev.filter(p => p.id !== project.id) : [...prev, { id: project.id, appliedAt: new Date(), appliedBy: userName }]); };
  const addTeamNote = (projectId, note, isRecommendation = false) => { setTeamNotes(prev => ({ ...prev, [projectId]: [...(prev[projectId] || []), { id: Date.now(), text: note, author: userName, timestamp: new Date(), isRecommendation }] })); };

  const uniqueLocations = [...new Set(projects.filter(p => !p.isInstruction && p.client?.country).map(p => p.client.country))].sort();

  const filteredProjects = projects.filter(p => {
    if (p.isInstruction) return true;
    if (filter === 'saved') return savedProjects.some(s => s.id === p.id);
    if (filter === 'applied') return appliedProjects.some(a => a.id === p.id);
    const matchesCategory = filter === 'all' || p.category === filter;
    const matchesSearch = !searchTerm || p.title?.toLowerCase().includes(searchTerm.toLowerCase()) || p.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesLocation = locationFilter === 'all' || p.client?.country === locationFilter;
    return matchesCategory && matchesSearch && matchesLocation;
  }).sort((a, b) => {
    if (a.isInstruction) return -1;
    if (sortBy === 'match') return (b.matchScore || 0) - (a.matchScore || 0);
    if (sortBy === 'budget') return (b.budgetMax || 0) - (a.budgetMax || 0);
    return new Date(b.postedDate) - new Date(a.postedDate);
  });

  const realProjects = projects.filter(p => !p.isInstruction);
  const stats = {
    total: realProjects.length,
    filtered: filteredProjects.filter(p => !p.isInstruction).length,
    avgMatch: realProjects.length ? Math.round(realProjects.reduce((s, p) => s + (p.matchScore || 0), 0) / realProjects.length) : 0,
    potential: realProjects.reduce((s, p) => { const off = offerings.find(o => o.name === p.category); const avgRate = off ? (off.rateMin + off.rateMax) / 2 : 100; return s + ((p.estimatedHours || 0) * avgRate); }, 0),
    saved: savedProjects.length,
    applied: appliedProjects.length,
    proposals: Object.keys(proposals).length
  };

  const skillsAnalysis = analyzeSkillsGap();

  const getTimeAgo = (date) => { const h = Math.floor((Date.now() - new Date(date)) / 3600000); return h < 1 ? 'Just now' : h < 24 ? `${h}h ago` : `${Math.floor(h/24)}d ago`; };
  const getRecommendationColor = (rec) => { if (rec === 'STRONG BID') return 'bg-emerald-500 text-white'; if (rec === 'BID') return 'bg-blue-500 text-white'; if (rec === 'CONSIDER') return 'bg-amber-500 text-white'; if (rec === 'SKIP') return 'bg-red-500 text-white'; return 'bg-slate-500 text-white'; };

  useEffect(() => { checkProxyStatus(); fetchProjects(); const i1 = setInterval(checkProxyStatus, 30000); const i2 = setInterval(fetchProjects, 300000); return () => { clearInterval(i1); clearInterval(i2); }; }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-slate-100">
      <div className="border-b border-slate-800 bg-slate-950/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
            <div><h1 className="text-2xl font-bold gradient-text">PaysonTech Upwork Tracker</h1><p className="text-slate-400 text-sm">AI-Powered Project Intelligence</p></div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${proxyStatus === 'online' ? 'bg-emerald-500/20 text-emerald-300' : proxyStatus === 'checking' ? 'bg-amber-500/20 text-amber-300' : 'bg-rose-500/20 text-rose-300'}`}>
                {proxyStatus === 'online' ? <Wifi size={16}/> : proxyStatus === 'checking' ? <RefreshCw size={16} className="animate-spin"/> : <WifiOff size={16}/>}
              </div>
              <button onClick={() => setShowTemplateEditor(true)} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg" title="Edit Template"><PenTool size={18}/></button>
              <button onClick={() => setShowSettings(true)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center gap-2"><Settings size={18}/><span className="hidden sm:inline">Categories</span></button>
              <button onClick={fetchProjects} disabled={loading} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg flex items-center gap-2 disabled:opacity-50"><RefreshCw size={18} className={loading ? 'animate-spin' : ''}/>{loading ? '...' : 'Refresh'}</button>
            </div>
          </div>
          
          {/* Tabs */}
          <div className="flex gap-2 mb-4">
            <button onClick={() => setActiveTab('projects')} className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 ${activeTab === 'projects' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
              <FileText size={18}/> Projects
            </button>
            <button onClick={() => setActiveTab('skills')} className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 ${activeTab === 'skills' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
              <BarChart3 size={18}/> Skills Gap Analysis
              {skillsAnalysis.missing.length > 0 && <span className="px-2 py-0.5 bg-amber-500 text-white text-xs rounded-full">{skillsAnalysis.missing.length}</span>}
            </button>
          </div>
          
          {activeTab === 'projects' && (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {[{ icon: FileText, label: 'Projects', value: `${stats.filtered}/${stats.total}`, color: 'blue' }, { icon: TrendingUp, label: 'Avg Match', value: `${stats.avgMatch}%`, color: 'emerald' }, { icon: DollarSign, label: 'Potential', value: `$${(stats.potential/1000).toFixed(0)}k`, color: 'purple' }, { icon: Bookmark, label: 'Saved', value: stats.saved, color: 'amber' }, { icon: Send, label: 'Applied', value: stats.applied, color: 'cyan' }, { icon: Zap, label: 'Proposals', value: stats.proposals, color: 'rose' }].map((s, i) => (
                <div key={i} className="glass rounded-xl p-2 sm:p-3 flex items-center gap-2"><s.icon size={16} className={`text-${s.color}-400 hidden sm:block`}/><div><p className="text-slate-400 text-xs">{s.label}</p><p className="text-sm sm:text-lg font-bold">{s.value}</p></div></div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-4">
        {/* PROJECTS TAB */}
        {activeTab === 'projects' && (
          <>
            <div className="flex flex-col sm:flex-row gap-2 mb-4">
              <div className="flex-1 relative"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20}/><input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-12 pr-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-sm"/></div>
              <select value={filter} onChange={e => setFilter(e.target.value)} className="px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-sm"><option value="all">All Categories</option><option value="saved">⭐ Saved ({stats.saved})</option><option value="applied">✅ Applied ({stats.applied})</option>{offerings.map(o => <option key={o.name} value={o.name}>{o.name}</option>)}</select>
              <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)} className="px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-sm"><option value="all">🌍 All Locations</option>{uniqueLocations.map(loc => <option key={loc} value={loc}>{loc}</option>)}</select>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-sm"><option value="date">Newest</option><option value="match">Best Match</option><option value="budget">Budget</option></select>
            </div>
            {lastRefresh && <p className="text-slate-500 text-xs mb-4">Updated: {lastRefresh.toLocaleTimeString()}</p>}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredProjects.map(project => {
                const isSaved = savedProjects.some(p => p.id === project.id);
                const isApplied = appliedProjects.some(p => p.id === project.id);
                const projectNotes = teamNotes[project.id] || [];
                const hasRecommendation = projectNotes.some(n => n.isRecommendation);
                const savedByOthers = savedProjects.filter(p => p.id === project.id && p.savedBy !== userName);
                
                return (
                  <div key={project.id} className={`glass rounded-xl p-4 ${project.isInstruction ? 'border-2 border-amber-500/50' : 'cursor-pointer hover:border-indigo-500/50'} ${isApplied ? 'border-l-4 border-l-cyan-500' : ''}`} onClick={() => !project.isInstruction && setSelectedProject(project)}>
                    {project.isInstruction ? (
                      <div><h3 className="text-lg font-semibold mb-2 text-amber-400">{project.title}</h3><p className="text-slate-300 text-sm whitespace-pre-line mb-4">{project.description}</p><a href={project.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 rounded-lg text-sm">Browse Upwork <ExternalLink size={16}/></a></div>
                    ) : (
                      <>
                        <div className="flex justify-between mb-2">
                          <div className="flex-1 pr-2">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <span className="text-xs text-slate-400">{getTimeAgo(project.postedDate)}</span>
                              <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 text-xs rounded-full">{project.category}</span>
                              {project.client?.paymentVerified && <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-xs rounded-full flex items-center gap-1"><Shield size={10}/>Verified</span>}
                              {project.client?.country && <span className="px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded-full flex items-center gap-1"><MapPin size={10}/>{project.client.country}</span>}
                              {isApplied && <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-300 text-xs rounded-full">Applied</span>}
                              {hasRecommendation && <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-xs rounded-full flex items-center gap-1"><ThumbsUp size={10}/>Recommended</span>}
                            </div>
                            <h3 className="font-semibold mb-1 line-clamp-2">{project.title}</h3>
                            <p className="text-slate-400 text-sm line-clamp-2">{project.description}</p>
                          </div>
                          <div className="flex flex-col items-center gap-1">
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-sm">{project.matchScore}%</div>
                            <div className="flex gap-1">
                              <button onClick={e => { e.stopPropagation(); toggleSave(project); }} className={isSaved ? 'text-amber-400' : 'text-slate-500 hover:text-amber-400'}>{isSaved ? <Star size={14} fill="currentColor"/> : <Bookmark size={14}/>}</button>
                              {savedByOthers.length > 0 && <span className="text-xs text-purple-400 flex items-center"><Users size={12}/>{savedByOthers.length}</span>}
                            </div>
                          </div>
                        </div>
                        {project.skills?.length > 0 && <div className="flex flex-wrap gap-1 mb-2">{project.skills.slice(0, 4).map((s, i) => <span key={i} className="px-2 py-0.5 bg-slate-700/50 text-slate-300 text-xs rounded">{s}</span>)}{project.skills.length > 4 && <span className="text-slate-500 text-xs">+{project.skills.length - 4}</span>}</div>}
                        <div className="flex items-center gap-3 mb-3 text-sm flex-wrap">
                          <span className="flex items-center gap-1"><DollarSign size={14} className="text-slate-500"/>{project.budget}</span>
                          <span className="flex items-center gap-1"><Clock size={14} className="text-slate-500"/>{project.estimatedHours}h est.</span>
                          {project.client?.totalSpent > 0 && <span className="text-emerald-400 flex items-center gap-1"><User size={14}/>${(project.client.totalSpent/1000).toFixed(0)}k spent</span>}
                        </div>
                        <div className="flex gap-2">
                          {proposals[project.id] ? (
                            <button className="flex-1 px-3 py-2 bg-emerald-600/20 border border-emerald-600/30 text-emerald-300 rounded-lg text-sm flex items-center justify-center gap-1" onClick={e => { e.stopPropagation(); setSelectedProject(project); }}><Eye size={14}/> View Analysis</button>
                          ) : (
                            <button onClick={e => { e.stopPropagation(); setSelectedProject(project); generateProposal(project); }} className="flex-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm flex items-center justify-center gap-1"><Zap size={14}/> Analyze</button>
                          )}
                          <button onClick={e => { e.stopPropagation(); toggleApplied(project); }} className={`px-3 py-2 rounded-lg ${isApplied ? 'bg-cyan-600 text-white' : 'bg-slate-700 hover:bg-slate-600'}`}><Send size={16}/></button>
                          <a href={project.link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg"><ExternalLink size={16}/></a>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            {filteredProjects.length === 0 && !loading && <div className="text-center py-12"><AlertCircle size={40} className="mx-auto text-slate-600 mb-3"/><p className="text-slate-400">No projects found</p></div>}
          </>
        )}

        {/* SKILLS GAP ANALYSIS TAB */}
        {activeTab === 'skills' && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="glass rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2"><Target size={20} className="text-emerald-400"/><span className="text-slate-400 text-sm">Skills Coverage</span></div>
                <p className="text-3xl font-bold">{skillsAnalysis.coverage}%</p>
                <p className="text-slate-500 text-xs mt-1">of market demand</p>
              </div>
              <div className="glass rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2"><CheckCircle size={20} className="text-emerald-400"/><span className="text-slate-400 text-sm">Skills We Have</span></div>
                <p className="text-3xl font-bold text-emerald-400">{skillsAnalysis.matched.length}</p>
                <p className="text-slate-500 text-xs mt-1">matching demand</p>
              </div>
              <div className="glass rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2"><AlertCircle size={20} className="text-amber-400"/><span className="text-slate-400 text-sm">Skills Missing</span></div>
                <p className="text-3xl font-bold text-amber-400">{skillsAnalysis.missing.length}</p>
                <p className="text-slate-500 text-xs mt-1">opportunities</p>
              </div>
              <div className="glass rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2"><DollarSign size={20} className="text-rose-400"/><span className="text-slate-400 text-sm">Est. Missed Revenue</span></div>
                <p className="text-3xl font-bold text-rose-400">${(skillsAnalysis.missedRevenue/1000).toFixed(0)}k</p>
                <p className="text-slate-500 text-xs mt-1">potential/month</p>
              </div>
            </div>

            {/* Missing Skills - Priority */}
            <div className="glass rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2"><AlertCircle className="text-amber-400"/> Skills Gap - Add These to Win More Projects</h2>
                  <p className="text-slate-400 text-sm mt-1">Based on {skillsAnalysis.totalProjects} projects analyzed. Click "Add" to add a skill to a category.</p>
                </div>
                <button onClick={fetchProjects} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg flex items-center gap-2 text-sm">
                  <RefreshCw size={16}/> Refresh Analysis
                </button>
              </div>
              
              {skillsAnalysis.missing.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle size={48} className="mx-auto text-emerald-400 mb-3"/>
                  <p className="text-emerald-400 font-semibold">Excellent! You have all the skills demanded by current projects.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {skillsAnalysis.missing.slice(0, 15).map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg hover:bg-slate-800 transition-colors">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-amber-300">{item.skill}</span>
                          <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 text-xs rounded-full">{item.demand} projects need this</span>
                          <span className="text-slate-500 text-xs">({item.percentage}% of jobs)</span>
                        </div>
                        <p className="text-slate-500 text-xs mt-1 line-clamp-1">Projects: {item.projects.slice(0, 2).join(', ')}{item.projects.length > 2 ? ` +${item.projects.length - 2} more` : ''}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <select onChange={e => { if (e.target.value !== '') { addSkillToCategory(item.skill, parseInt(e.target.value)); e.target.value = ''; }}} className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-sm" defaultValue="">
                          <option value="" disabled>Add to...</option>
                          {offerings.map((o, idx) => <option key={idx} value={idx}>{o.name}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Skills We Have */}
            <div className="glass rounded-xl p-6">
              <h2 className="text-xl font-bold flex items-center gap-2 mb-4"><CheckCircle className="text-emerald-400"/> Skills We Have (Matching Market Demand)</h2>
              {skillsAnalysis.matched.length === 0 ? (
                <p className="text-slate-400">No matching skills found. Add skills to your categories in Settings.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {skillsAnalysis.matched.map((item, i) => (
                    <div key={i} className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                      <p className="font-medium text-emerald-300">{item.skill}</p>
                      <p className="text-slate-400 text-xs mt-1">{item.demand} projects • {item.percentage}%</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Our Current Skills by Category */}
            <div className="glass rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Our Skills by Category (from paysontech.net)</h2>
                <button onClick={() => setShowSettings(true)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center gap-2 text-sm">
                  <Settings size={16}/> Edit Categories
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {offerings.map((o, i) => (
                  <div key={i} className="p-4 bg-slate-800/50 rounded-lg">
                    <h3 className="font-semibold text-indigo-300 mb-2">{o.name}</h3>
                    <p className="text-slate-500 text-xs mb-2">${o.rateMin}-${o.rateMax}/hr</p>
                    <div className="flex flex-wrap gap-1">
                      {o.skills?.map((s, j) => <span key={j} className="px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded">{s}</span>)}
                      {(!o.skills || o.skills.length === 0) && <span className="text-slate-500 text-xs">No skills added</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Project Modal */}
      {selectedProject && !selectedProject.isInstruction && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => setSelectedProject(null)}>
          <div className="glass rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-sm text-slate-400">{getTimeAgo(selectedProject.postedDate)}</span>
                  <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-sm rounded-full">{selectedProject.matchScore}% Match</span>
                  {selectedProject.client?.country && <span className="px-2 py-0.5 bg-slate-700 text-slate-300 text-sm rounded-full flex items-center gap-1"><MapPin size={12}/>{selectedProject.client.country}</span>}
                </div>
                <h2 className="text-xl font-bold">{selectedProject.title}</h2>
              </div>
              <button onClick={() => setSelectedProject(null)} className="p-1 hover:bg-slate-700 rounded-lg h-fit"><XCircle size={24}/></button>
            </div>
            <p className="text-slate-300 text-sm mb-4 max-h-32 overflow-y-auto">{selectedProject.description}</p>
            
            <div className="glass rounded-lg p-3 mb-4">
              <p className="text-xs text-slate-500 mb-2">CLIENT INFO</p>
              <div className="flex flex-wrap gap-4 text-sm">
                <span>Budget: <strong>{selectedProject.budget}</strong></span>
                {selectedProject.client?.totalSpent > 0 && <span className="text-emerald-400">${(selectedProject.client.totalSpent/1000).toFixed(0)}k spent</span>}
                {selectedProject.client?.hireRate > 0 && <span>{selectedProject.client.hireRate}% hire rate</span>}
                {selectedProject.client?.feedbackRate > 0 && <span>⭐ {selectedProject.client.feedbackRate}</span>}
                {selectedProject.client?.paymentVerified && <span className="text-emerald-400 flex items-center gap-1"><Shield size={12}/>Verified</span>}
              </div>
            </div>
            
            {selectedProject.skills?.length > 0 && <div className="mb-4"><p className="text-xs text-slate-500 mb-2">REQUIRED SKILLS</p><div className="flex flex-wrap gap-1">{selectedProject.skills.map((s, i) => <span key={i} className="px-2 py-1 bg-slate-700/50 text-slate-300 text-xs rounded">{s}</span>)}</div></div>}

            {proposals[selectedProject.id] ? (
              <div className="space-y-4">
                <div className={`rounded-lg p-4 ${getRecommendationColor(proposals[selectedProject.id].analysis?.recommendation)}`}>
                  <div className="flex items-center justify-between">
                    <div><p className="text-xs opacity-80">AI RECOMMENDATION</p><p className="text-xl font-bold">{proposals[selectedProject.id].analysis?.recommendation || 'REVIEW'}</p></div>
                    <div className="text-right"><p className="text-xs opacity-80">CONFIDENCE</p><p className="text-2xl font-bold">{proposals[selectedProject.id].analysis?.confidenceScore || 0}%</p></div>
                  </div>
                  <p className="text-sm mt-2 opacity-90">{proposals[selectedProject.id].analysis?.recommendationReason}</p>
                </div>
                
                {proposals[selectedProject.id].analysis?.confidenceBreakdown?.length > 0 && (
                  <div className="glass rounded-lg p-4">
                    <p className="text-xs text-slate-500 mb-2 flex items-center gap-1"><HelpCircle size={12}/> WHY THIS CONFIDENCE SCORE?</p>
                    <ul className="text-sm text-slate-300 space-y-1">{proposals[selectedProject.id].analysis.confidenceBreakdown.map((item, i) => <li key={i} className="flex items-center gap-2"><CheckCircle size={12} className="text-emerald-400"/>{item}</li>)}</ul>
                  </div>
                )}
                
                <div className="glass rounded-lg p-4"><p className="text-xs text-slate-500 mb-2">PROJECT SUMMARY</p><p className="text-slate-200 text-sm">{proposals[selectedProject.id].analysis?.projectSummary}</p></div>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="glass rounded-lg p-3"><p className="text-xs text-slate-500">Est. Hours</p><p className="text-lg font-bold">{proposals[selectedProject.id].analysis?.estimatedHours}h</p></div>
                  <div className="glass rounded-lg p-3"><p className="text-xs text-slate-500">Complexity</p><p className="text-lg font-bold">{proposals[selectedProject.id].analysis?.complexity || 'Medium'}</p></div>
                  <div className="glass rounded-lg p-3"><p className="text-xs text-slate-500">Our Rate</p><p className="text-lg font-bold">${proposals[selectedProject.id].offering?.rateMin}-${proposals[selectedProject.id].offering?.rateMax}/hr</p></div>
                  <div className="glass rounded-lg p-3"><p className="text-xs text-slate-500">Estimate</p><p className="text-lg font-bold gradient-text">${proposals[selectedProject.id].analysis?.totalEstimateMin?.toLocaleString()}-${proposals[selectedProject.id].analysis?.totalEstimateMax?.toLocaleString()}</p></div>
                </div>
                
                <div className="glass rounded-lg p-4"><p className="text-xs text-slate-500 mb-2">TIMELINE</p><p className="text-slate-200"><strong>Our Estimate:</strong> {proposals[selectedProject.id].analysis?.timeline || 'TBD'}</p></div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="glass rounded-lg p-4"><p className="text-xs text-slate-500 mb-2">✅ SKILLS WE HAVE</p><div className="flex flex-wrap gap-1">{proposals[selectedProject.id].analysis?.skillsMatched?.length > 0 ? proposals[selectedProject.id].analysis.skillsMatched.map((s, i) => <span key={i} className="px-2 py-1 bg-emerald-500/20 text-emerald-300 text-xs rounded">{s}</span>) : <span className="text-slate-400 text-sm">General</span>}</div></div>
                  <div className="glass rounded-lg p-4"><p className="text-xs text-slate-500 mb-2">⚠️ SKILLS MISSING</p><div className="flex flex-wrap gap-1">{proposals[selectedProject.id].analysis?.skillsMissing?.length > 0 ? proposals[selectedProject.id].analysis.skillsMissing.map((s, i) => <span key={i} className="px-2 py-1 bg-amber-500/20 text-amber-300 text-xs rounded">{s}</span>) : <span className="text-emerald-400 text-sm">None!</span>}</div></div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="glass rounded-lg p-4"><p className="text-xs text-slate-500 mb-2">KEY DELIVERABLES</p><ul className="text-sm text-slate-300 space-y-1">{proposals[selectedProject.id].analysis?.keyDeliverables?.map((d, i) => <li key={i} className="flex items-start gap-2"><CheckCircle size={14} className="text-emerald-400 mt-0.5"/>{d}</li>)}</ul></div>
                  <div className="glass rounded-lg p-4"><p className="text-xs text-slate-500 mb-2">RISKS</p><ul className="text-sm text-slate-300 space-y-1">{proposals[selectedProject.id].analysis?.risks?.map((r, i) => <li key={i} className="flex items-start gap-2"><AlertCircle size={14} className="text-amber-400 mt-0.5"/>{r}</li>)}</ul></div>
                </div>
                
                {proposals[selectedProject.id].analysis?.questionsForClient?.length > 0 && (
                  <div className="glass rounded-lg p-4"><p className="text-xs text-slate-500 mb-2">❓ QUESTIONS FOR CLIENT</p><ul className="text-sm text-slate-300 space-y-1">{proposals[selectedProject.id].analysis.questionsForClient.map((q, i) => <li key={i}>• {q}</li>)}</ul></div>
                )}
                
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-xs text-slate-500">GENERATED PROPOSAL</p>
                    <div className="flex gap-2">
                      <button onClick={() => exportToCSV(selectedProject, proposals[selectedProject.id])} className="flex items-center gap-1 px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm"><Download size={14}/> CSV</button>
                      <button onClick={() => copyProposal(proposals[selectedProject.id].proposal, selectedProject.id)} className="flex items-center gap-1 px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm">{copiedId === selectedProject.id ? <CheckCircle size={14}/> : <Copy size={14}/>}{copiedId === selectedProject.id ? 'Copied!' : 'Copy'}</button>
                    </div>
                  </div>
                  <div className="glass rounded-lg p-4 max-h-60 overflow-y-auto"><p className="text-slate-200 text-sm whitespace-pre-wrap">{proposals[selectedProject.id].proposal}</p></div>
                </div>
                
                <div className="glass rounded-lg p-4">
                  <p className="text-xs text-slate-500 mb-2">TEAM NOTES</p>
                  {teamNotes[selectedProject.id]?.length > 0 && <div className="space-y-2 mb-3">{teamNotes[selectedProject.id].map(note => <div key={note.id} className={`p-2 rounded ${note.isRecommendation ? 'bg-purple-500/20' : 'bg-slate-700/50'}`}><p className="text-sm text-slate-300">{note.text}</p><p className="text-xs text-slate-500 mt-1">{note.author} • {new Date(note.timestamp).toLocaleString()}</p></div>)}</div>}
                  <div className="flex gap-2">
                    <input type="text" placeholder="Add a note..." className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm" onKeyDown={e => { if (e.key === 'Enter' && e.target.value) { addTeamNote(selectedProject.id, e.target.value); e.target.value = ''; }}}/>
                    <button onClick={() => { const note = prompt('Add recommendation:'); if (note) addTeamNote(selectedProject.id, note, true); }} className="px-3 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm flex items-center gap-1"><ThumbsUp size={14}/></button>
                  </div>
                </div>
                
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => generateProposal(selectedProject)} disabled={generatingProposal} className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center justify-center gap-1 disabled:opacity-50"><RefreshCw size={14} className={generatingProposal ? 'animate-spin' : ''}/> Regenerate</button>
                  <button onClick={() => toggleApplied(selectedProject)} className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1 ${appliedProjects.some(p => p.id === selectedProject.id) ? 'bg-cyan-600' : 'bg-slate-700 hover:bg-slate-600'}`}><Send size={14}/> {appliedProjects.some(p => p.id === selectedProject.id) ? 'Applied ✓' : 'Mark Applied'}</button>
                  <a href={selectedProject.link} target="_blank" rel="noopener noreferrer" className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-center flex items-center justify-center gap-1">Apply <ExternalLink size={14}/></a>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <button onClick={() => generateProposal(selectedProject)} disabled={generatingProposal} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-semibold flex items-center justify-center gap-2 mx-auto disabled:opacity-50"><Zap size={18} className={generatingProposal ? 'animate-pulse' : ''}/> {generatingProposal ? 'Analyzing...' : 'Analyze & Generate'}</button>
                {generatingProposal && <p className="text-slate-400 text-sm mt-2">AI analyzing (10-20s)...</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Template Editor Modal */}
      {showTemplateEditor && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => setShowTemplateEditor(false)}>
          <div className="glass rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between mb-4"><h2 className="text-xl font-bold">Edit Proposal Template</h2><button onClick={() => setShowTemplateEditor(false)} className="p-1 hover:bg-slate-700 rounded-lg"><XCircle size={24}/></button></div>
            <div className="mb-4"><label className="block text-sm text-slate-400 mb-2">Your Name</label><input type="text" value={userName} onChange={e => setUserName(e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg"/></div>
            <div className="mb-4"><label className="block text-sm text-slate-400 mb-2">Proposal Template</label><textarea value={proposalTemplate} onChange={e => setProposalTemplate(e.target.value)} rows={15} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-mono"/></div>
            <div className="flex gap-2"><button onClick={() => setProposalTemplate(DEFAULT_PROPOSAL_TEMPLATE)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg">Reset</button><button onClick={() => setShowTemplateEditor(false)} className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg">Save</button></div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => setShowSettings(false)}>
          <div className="glass rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between mb-4"><h2 className="text-xl font-bold">Service Categories</h2><button onClick={() => setShowSettings(false)} className="p-1 hover:bg-slate-700 rounded-lg"><XCircle size={24}/></button></div>
            <p className="text-slate-400 text-sm mb-4">Configure services based on paysontech.net offerings. Add skills to improve matching.</p>
            <div className="space-y-3 mb-4">
              {offerings.map((o, i) => (
                <div key={i} className="glass rounded-lg p-4">
                  {editingOffering === i ? (
                    <div className="space-y-3">
                      <input type="text" value={o.name} onChange={e => { const u = [...offerings]; u[i].name = e.target.value; setOfferings(u); }} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg" placeholder="Service name"/>
                      <textarea value={o.keywords.join(', ')} onChange={e => { const u = [...offerings]; u[i].keywords = e.target.value.split(',').map(k => k.trim()).filter(k => k); setOfferings(u); }} rows={2} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm" placeholder="Keywords"/>
                      <div className="grid grid-cols-2 gap-2">
                        <div><label className="text-xs text-slate-400">Min Rate</label><input type="number" value={o.rateMin} onChange={e => { const u = [...offerings]; u[i].rateMin = parseFloat(e.target.value) || 0; setOfferings(u); }} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg"/></div>
                        <div><label className="text-xs text-slate-400">Max Rate</label><input type="number" value={o.rateMax} onChange={e => { const u = [...offerings]; u[i].rateMax = parseFloat(e.target.value) || 0; setOfferings(u); }} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg"/></div>
                      </div>
                      <div><label className="text-xs text-slate-400">Skills (comma-separated)</label><textarea value={o.skills?.join(', ') || ''} onChange={e => { const u = [...offerings]; u[i].skills = e.target.value.split(',').map(k => k.trim()).filter(k => k); setOfferings(u); }} rows={3} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm"/></div>
                      <div className="flex gap-2"><button onClick={() => setEditingOffering(null)} className="flex-1 py-2 bg-indigo-600 rounded-lg">Done</button><button onClick={() => { setOfferings(offerings.filter((_, j) => j !== i)); setEditingOffering(null); }} className="px-3 py-2 bg-rose-600/20 text-rose-300 rounded-lg"><Trash2 size={18}/></button></div>
                    </div>
                  ) : (
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold mb-1">{o.name}</h3>
                        <p className="text-slate-400 text-sm mb-2">${o.rateMin}-${o.rateMax}/hr</p>
                        <div className="flex flex-wrap gap-1">{o.skills?.slice(0, 6).map((s, j) => <span key={j} className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-xs rounded-full">{s}</span>)}{o.skills?.length > 6 && <span className="text-slate-500 text-xs">+{o.skills.length - 6}</span>}</div>
                      </div>
                      <button onClick={() => setEditingOffering(i)} className="p-1 hover:bg-slate-700 rounded-lg"><Edit size={18}/></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button onClick={() => { setOfferings([...offerings, { name: 'New Service', keywords: ['keyword'], rateMin: 50, rateMax: 100, skills: [] }]); setEditingOffering(offerings.length); }} className="w-full py-2 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center justify-center gap-2"><Plus size={18}/> Add Category</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
