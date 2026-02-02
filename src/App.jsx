import React, { useState, useEffect, useCallback } from 'react';
import { 
  Search, TrendingUp, Clock, Zap, FileText, 
  DollarSign, AlertCircle, CheckCircle, XCircle, Settings, 
  Plus, Trash2, Edit, RefreshCw, Wifi, WifiOff, ExternalLink, 
  Copy, Bookmark, Star, Shield, User
} from 'lucide-react';
import { API_URL, DEFAULT_OFFERINGS, parseApifyJob } from './config';

function App() {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [generatingProposal, setGeneratingProposal] = useState(false);
  const [proposals, setProposals] = useState({});
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [proxyStatus, setProxyStatus] = useState('checking');
  const [lastRefresh, setLastRefresh] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  
  const [savedProjects, setSavedProjects] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('upwork_saved_projects')) || [];
    } catch { return []; }
  });
  
  const [offerings, setOfferings] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('upwork_offerings')) || DEFAULT_OFFERINGS;
    } catch { return DEFAULT_OFFERINGS; }
  });
  
  const [showSettings, setShowSettings] = useState(false);
  const [editingOffering, setEditingOffering] = useState(null);
  const [customRate, setCustomRate] = useState('');
  const [showRateInput, setShowRateInput] = useState(false);
  const [sortBy, setSortBy] = useState('date');

  useEffect(() => {
    localStorage.setItem('upwork_offerings', JSON.stringify(offerings));
  }, [offerings]);

  useEffect(() => {
    localStorage.setItem('upwork_saved_projects', JSON.stringify(savedProjects));
  }, [savedProjects]);

  const checkProxyStatus = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(API_URL, { signal: controller.signal });
      clearTimeout(timeoutId);
      setProxyStatus(response.ok ? 'online' : 'offline');
      return response.ok;
    } catch {
      setProxyStatus('offline');
      return false;
    }
  }, []);

  const fetchProjects = async () => {
    setLoading(true);
    
    const isOnline = await checkProxyStatus();
    if (!isOnline) {
      setProjects([{
        id: 'offline', title: '🔌 Backend Offline',
        description: `Cannot connect to ${API_URL}. Check Render deployment.`,
        link: 'https://upwork.com', postedDate: new Date(),
        category: 'System', budget: 'N/A', matchScore: 0, isInstruction: true
      }]);
      setLoading(false);
      return;
    }
    
    try {
      const allKeywords = offerings.flatMap(o => o.keywords.slice(0, 2));
      const uniqueKeywords = [...new Set(allKeywords)].slice(0, 10);
      
      const response = await fetch(`${API_URL}/api/upwork/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: uniqueKeywords, limit: 100 })
      });
      
      const data = await response.json();
      
      if (data.success && data.jobs?.length > 0) {
        const parsed = new Map();
        data.jobs.forEach(job => {
          const offering = offerings.find(o => 
            o.keywords.some(kw => 
              (job.title || '').toLowerCase().includes(kw.toLowerCase()) ||
              (job.description || '').toLowerCase().includes(kw.toLowerCase())
            )
          ) || offerings[0];
          
          const p = parseApifyJob(job, '', offering);
          if (!parsed.has(p.id)) parsed.set(p.id, p);
        });
        
        setProjects(Array.from(parsed.values()));
        setLastRefresh(new Date());
      } else {
        setProjects([{
          id: 'no-results', title: '📭 No Projects Found',
          description: data.error || 'Apify may still be processing. Wait 30-60 seconds and refresh.',
          link: 'https://upwork.com', postedDate: new Date(),
          category: 'System', budget: 'N/A', matchScore: 0, isInstruction: true
        }]);
      }
    } catch (err) {
      setProjects([{
        id: 'error', title: '❌ Error',
        description: err.message,
        link: 'https://upwork.com', postedDate: new Date(),
        category: 'System', budget: 'N/A', matchScore: 0, isInstruction: true
      }]);
    }
    setLoading(false);
  };

  const generateProposal = async (project, hourlyRate = null) => {
    setGeneratingProposal(true);
    const offering = offerings.find(o => o.name === project.category);
    const rate = hourlyRate || offering?.defaultRate || 100;
    const estimatedCost = project.estimatedHours * rate;
    
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          messages: [{
            role: 'user',
            content: `Generate a compelling Upwork proposal for:

PROJECT: ${project.title}
DESCRIPTION: ${project.description}
SKILLS: ${project.skills?.join(', ') || 'Not specified'}
BUDGET: ${project.budget}

MY OFFER: $${rate}/hr, ~${project.estimatedHours}h, Total: $${estimatedCost}

Write a professional 200-word proposal with: hook, relevant experience, approach, timeline, pricing. No generic phrases.

Return JSON only: {"proposal": "text", "keyPoints": ["point1", "point2"], "estimatedTimeline": "X weeks"}`
          }]
        })
      });

      const data = await response.json();
      const text = data.content?.find(i => i.type === 'text')?.text || '';
      
      let proposalData;
      try {
        proposalData = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim());
      } catch {
        proposalData = { proposal: text, keyPoints: [], estimatedTimeline: '2-3 weeks' };
      }
      
      setProposals(prev => ({
        ...prev,
        [project.id]: { ...proposalData, rate, estimatedHours: project.estimatedHours, estimatedCost, generatedAt: new Date() }
      }));
      setShowRateInput(false);
      setCustomRate('');
    } catch (error) {
      setProposals(prev => ({
        ...prev,
        [project.id]: { proposal: `Error: ${error.message}`, keyPoints: [], rate, estimatedHours: project.estimatedHours, estimatedCost }
      }));
    }
    setGeneratingProposal(false);
  };

  const copyProposal = async (text, id) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleSave = (project) => {
    setSavedProjects(prev => 
      prev.some(p => p.id === project.id) 
        ? prev.filter(p => p.id !== project.id)
        : [...prev, { ...project, savedAt: new Date() }]
    );
  };

  useEffect(() => {
    checkProxyStatus();
    fetchProjects();
    const i1 = setInterval(checkProxyStatus, 30000);
    const i2 = setInterval(fetchProjects, 300000);
    return () => { clearInterval(i1); clearInterval(i2); };
  }, []);

  const filteredProjects = projects
    .filter(p => {
      if (filter === 'saved') return savedProjects.some(s => s.id === p.id);
      return (filter === 'all' || p.category === filter) &&
        (!searchTerm || p.title?.toLowerCase().includes(searchTerm.toLowerCase()) || p.description?.toLowerCase().includes(searchTerm.toLowerCase()));
    })
    .sort((a, b) => {
      if (a.isInstruction) return -1;
      if (sortBy === 'match') return (b.matchScore || 0) - (a.matchScore || 0);
      if (sortBy === 'budget') return (b.budgetMax || 0) - (a.budgetMax || 0);
      return new Date(b.postedDate) - new Date(a.postedDate);
    });

  const realProjects = projects.filter(p => !p.isInstruction);
  const stats = {
    total: realProjects.length,
    avgMatch: realProjects.length ? Math.round(realProjects.reduce((s, p) => s + (p.matchScore || 0), 0) / realProjects.length) : 0,
    potential: realProjects.reduce((s, p) => s + ((p.estimatedHours || 0) * (offerings.find(o => o.name === p.category)?.defaultRate || 100)), 0)
  };

  const getTimeAgo = (date) => {
    const h = Math.floor((Date.now() - new Date(date)) / 3600000);
    return h < 1 ? 'Just now' : h < 24 ? `${h}h ago` : `${Math.floor(h/24)}d ago`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-slate-100">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-950/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
            <div>
              <h1 className="text-2xl font-bold gradient-text">Upwork Tracker</h1>
              <p className="text-slate-400 text-sm">AI-Powered Project Intelligence</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                proxyStatus === 'online' ? 'bg-emerald-500/20 text-emerald-300' :
                proxyStatus === 'checking' ? 'bg-amber-500/20 text-amber-300' : 'bg-rose-500/20 text-rose-300'
              }`}>
                {proxyStatus === 'online' ? <Wifi size={16}/> : proxyStatus === 'checking' ? <RefreshCw size={16} className="animate-spin"/> : <WifiOff size={16}/>}
                <span className="hidden sm:inline">{proxyStatus === 'online' ? 'Online' : proxyStatus === 'checking' ? 'Checking...' : 'Offline'}</span>
              </div>
              <button onClick={() => setShowSettings(true)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center gap-2">
                <Settings size={18}/><span className="hidden sm:inline">Categories</span>
              </button>
              <button onClick={fetchProjects} disabled={loading} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg flex items-center gap-2 disabled:opacity-50">
                <RefreshCw size={18} className={loading ? 'animate-spin' : ''}/>{loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          </div>
          
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { icon: FileText, label: 'Projects', value: stats.total, color: 'blue' },
              { icon: TrendingUp, label: 'Avg Match', value: `${stats.avgMatch}%`, color: 'emerald' },
              { icon: DollarSign, label: 'Potential', value: `$${(stats.potential/1000).toFixed(0)}k`, color: 'purple' },
              { icon: Bookmark, label: 'Saved', value: savedProjects.length, color: 'amber' },
              { icon: Zap, label: 'Proposals', value: Object.keys(proposals).length, color: 'rose' }
            ].map((s, i) => (
              <div key={i} className="glass rounded-xl p-3 flex items-center gap-2">
                <s.icon size={18} className={`text-${s.color}-400`}/>
                <div><p className="text-slate-400 text-xs">{s.label}</p><p className="text-lg font-bold">{s.value}</p></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20}/>
            <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg"/>
          </div>
          <select value={filter} onChange={e => setFilter(e.target.value)} className="px-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg">
            <option value="all">All Categories</option>
            <option value="saved">⭐ Saved</option>
            {offerings.map(o => <option key={o.name} value={o.name}>{o.name}</option>)}
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="px-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg">
            <option value="date">Newest</option>
            <option value="match">Best Match</option>
            <option value="budget">Budget</option>
          </select>
        </div>
        
        {lastRefresh && <p className="text-slate-500 text-sm mb-4">Updated: {lastRefresh.toLocaleTimeString()}</p>}

        {/* Projects */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredProjects.map(project => {
            const isSaved = savedProjects.some(p => p.id === project.id);
            return (
              <div key={project.id} className={`glass rounded-xl p-4 ${project.isInstruction ? 'border-2 border-amber-500/50' : 'cursor-pointer hover:border-indigo-500/50'}`}
                onClick={() => !project.isInstruction && setSelectedProject(project)}>
                {project.isInstruction ? (
                  <div>
                    <h3 className="text-lg font-semibold mb-2 text-amber-400">{project.title}</h3>
                    <p className="text-slate-300 text-sm whitespace-pre-line mb-4">{project.description}</p>
                    <a href={project.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 rounded-lg text-sm">
                      Browse Upwork <ExternalLink size={16}/>
                    </a>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between mb-2">
                      <div className="flex-1 pr-2">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className="text-xs text-slate-400">{getTimeAgo(project.postedDate)}</span>
                          <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 text-xs rounded-full">{project.category}</span>
                          {project.client?.paymentVerified && <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-xs rounded-full flex items-center gap-1"><Shield size={10}/>Verified</span>}
                        </div>
                        <h3 className="font-semibold mb-1 line-clamp-2">{project.title}</h3>
                        <p className="text-slate-400 text-sm line-clamp-2">{project.description}</p>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-sm">{project.matchScore}%</div>
                        <button onClick={e => { e.stopPropagation(); toggleSave(project); }} className={isSaved ? 'text-amber-400' : 'text-slate-500 hover:text-amber-400'}>
                          {isSaved ? <Star size={16} fill="currentColor"/> : <Bookmark size={16}/>}
                        </button>
                      </div>
                    </div>
                    {project.skills?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {project.skills.slice(0, 4).map((s, i) => <span key={i} className="px-2 py-0.5 bg-slate-700/50 text-slate-300 text-xs rounded">{s}</span>)}
                        {project.skills.length > 4 && <span className="text-slate-500 text-xs">+{project.skills.length - 4}</span>}
                      </div>
                    )}
                    <div className="flex items-center gap-4 mb-3 text-sm">
                      <span className="flex items-center gap-1"><DollarSign size={14} className="text-slate-500"/>{project.budget}</span>
                      <span className="flex items-center gap-1"><Clock size={14} className="text-slate-500"/>{project.estimatedHours}h</span>
                      {project.client?.totalSpent > 0 && <span className="text-emerald-400 flex items-center gap-1"><User size={14}/>${(project.client.totalSpent/1000).toFixed(0)}k spent</span>}
                    </div>
                    <div className="flex gap-2">
                      {proposals[project.id] ? (
                        <button className="flex-1 px-3 py-2 bg-emerald-600/20 border border-emerald-600/30 text-emerald-300 rounded-lg text-sm flex items-center justify-center gap-1"
                          onClick={e => { e.stopPropagation(); setSelectedProject(project); }}>
                          <CheckCircle size={14}/> View Proposal
                        </button>
                      ) : (
                        <button onClick={e => { e.stopPropagation(); setSelectedProject(project); setShowRateInput(true); }}
                          className="flex-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm">Generate Proposal</button>
                      )}
                      <a href={project.link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                        className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg"><ExternalLink size={16}/></a>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
        
        {filteredProjects.length === 0 && !loading && (
          <div className="text-center py-12">
            <AlertCircle size={40} className="mx-auto text-slate-600 mb-3"/>
            <p className="text-slate-400">No projects found</p>
          </div>
        )}
      </div>

      {/* Project Modal */}
      {selectedProject && !selectedProject.isInstruction && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => { setSelectedProject(null); setShowRateInput(false); }}>
          <div className="glass rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
            {showRateInput && !proposals[selectedProject.id] ? (
              <div>
                <div className="flex justify-between mb-4">
                  <h2 className="text-xl font-bold">Set Your Rate</h2>
                  <button onClick={() => setSelectedProject(null)} className="p-1 hover:bg-slate-700 rounded-lg"><XCircle size={24}/></button>
                </div>
                <p className="text-slate-400 mb-4 line-clamp-2">{selectedProject.title}</p>
                <div className="glass rounded-lg p-4 mb-4">
                  <label className="block text-sm text-slate-400 mb-2">Hourly Rate ($/hr)</label>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                      <input type="number" value={customRate} onChange={e => setCustomRate(e.target.value)}
                        placeholder={`${offerings.find(o => o.name === selectedProject.category)?.defaultRate || 100}`}
                        className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-lg" autoFocus/>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-400">Total</div>
                      <div className="text-xl font-bold gradient-text">
                        ${((customRate || offerings.find(o => o.name === selectedProject.category)?.defaultRate || 100) * selectedProject.estimatedHours).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
                <button onClick={() => generateProposal(selectedProject, customRate ? parseFloat(customRate) : null)} disabled={generatingProposal}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                  <Zap size={18} className={generatingProposal ? 'animate-pulse' : ''}/>{generatingProposal ? 'Generating...' : 'Generate Proposal'}
                </button>
              </div>
            ) : (
              <>
                <div className="flex justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm text-slate-400">{getTimeAgo(selectedProject.postedDate)}</span>
                      <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-sm rounded-full">{selectedProject.matchScore}% Match</span>
                    </div>
                    <h2 className="text-xl font-bold">{selectedProject.title}</h2>
                  </div>
                  <button onClick={() => setSelectedProject(null)} className="p-1 hover:bg-slate-700 rounded-lg h-fit"><XCircle size={24}/></button>
                </div>
                <p className="text-slate-300 text-sm mb-4 max-h-40 overflow-y-auto">{selectedProject.description}</p>
                
                {selectedProject.skills?.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs text-slate-500 mb-2">SKILLS</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedProject.skills.map((s, i) => <span key={i} className="px-2 py-1 bg-slate-700/50 text-slate-300 text-xs rounded">{s}</span>)}
                    </div>
                  </div>
                )}
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                  <div className="glass rounded-lg p-2"><div className="text-slate-500 text-xs">Budget</div><div className="font-bold">{selectedProject.budget}</div></div>
                  <div className="glass rounded-lg p-2"><div className="text-slate-500 text-xs">Est. Hours</div><div className="font-bold">{selectedProject.estimatedHours}h</div></div>
                  <div className="glass rounded-lg p-2"><div className="text-slate-500 text-xs">Type</div><div className="font-bold">{selectedProject.isHourly ? 'Hourly' : 'Fixed'}</div></div>
                  <div className="glass rounded-lg p-2"><div className="text-slate-500 text-xs">Connects</div><div className="font-bold">{selectedProject.applicationCost || 'N/A'}</div></div>
                </div>

                {proposals[selectedProject.id] ? (
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <p className="text-xs text-slate-500">PROPOSAL</p>
                        <button onClick={() => copyProposal(proposals[selectedProject.id].proposal, selectedProject.id)}
                          className="flex items-center gap-1 px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm">
                          {copiedId === selectedProject.id ? <CheckCircle size={14}/> : <Copy size={14}/>}
                          {copiedId === selectedProject.id ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      <div className="glass rounded-lg p-4 max-h-60 overflow-y-auto">
                        <p className="text-slate-200 text-sm whitespace-pre-wrap">{proposals[selectedProject.id].proposal}</p>
                      </div>
                    </div>
                    <div className="glass rounded-lg p-4">
                      <div className="flex justify-between text-sm mb-2"><span className="text-slate-400">Rate</span><span className="font-bold">${proposals[selectedProject.id].rate}/hr</span></div>
                      <div className="flex justify-between text-sm mb-2"><span className="text-slate-400">Hours</span><span className="font-bold">{proposals[selectedProject.id].estimatedHours}h</span></div>
                      <div className="border-t border-slate-700 pt-2 mt-2 flex justify-between">
                        <span className="font-semibold">Total</span>
                        <span className="text-lg font-bold gradient-text">${proposals[selectedProject.id].estimatedCost?.toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setShowRateInput(true); setProposals(p => { const u = {...p}; delete u[selectedProject.id]; return u; }); }}
                        className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg">Regenerate</button>
                      <a href={selectedProject.link} target="_blank" rel="noopener noreferrer"
                        className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-center flex items-center justify-center gap-1">
                        Apply <ExternalLink size={16}/>
                      </a>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setShowRateInput(true)} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-semibold flex items-center justify-center gap-2">
                    <Zap size={18}/> Generate Proposal
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => setShowSettings(false)}>
          <div className="glass rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between mb-4">
              <h2 className="text-xl font-bold">Service Categories</h2>
              <button onClick={() => setShowSettings(false)} className="p-1 hover:bg-slate-700 rounded-lg"><XCircle size={24}/></button>
            </div>
            <p className="text-slate-400 text-sm mb-4">Jobs matching these keywords will be fetched.</p>
            <div className="space-y-3 mb-4">
              {offerings.map((o, i) => (
                <div key={i} className="glass rounded-lg p-4">
                  {editingOffering === i ? (
                    <div className="space-y-3">
                      <input type="text" value={o.name} onChange={e => { const u = [...offerings]; u[i].name = e.target.value; setOfferings(u); }}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg" placeholder="Service name"/>
                      <textarea value={o.keywords.join(', ')} onChange={e => { const u = [...offerings]; u[i].keywords = e.target.value.split(',').map(k => k.trim()).filter(k => k); setOfferings(u); }}
                        rows={2} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm" placeholder="keyword1, keyword2"/>
                      <input type="number" value={o.defaultRate} onChange={e => { const u = [...offerings]; u[i].defaultRate = parseFloat(e.target.value) || 0; setOfferings(u); }}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg" placeholder="Rate"/>
                      <div className="flex gap-2">
                        <button onClick={() => setEditingOffering(null)} className="flex-1 py-2 bg-indigo-600 rounded-lg">Done</button>
                        <button onClick={() => { setOfferings(offerings.filter((_, j) => j !== i)); setEditingOffering(null); }} className="px-3 py-2 bg-rose-600/20 text-rose-300 rounded-lg"><Trash2 size={18}/></button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold mb-1">{o.name}</h3>
                        <div className="flex flex-wrap gap-1 mb-1">
                          {o.keywords.slice(0, 4).map((k, j) => <span key={j} className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 text-xs rounded-full">{k}</span>)}
                          {o.keywords.length > 4 && <span className="text-slate-500 text-xs">+{o.keywords.length - 4}</span>}
                        </div>
                        <p className="text-slate-400 text-sm">${o.defaultRate}/hr</p>
                      </div>
                      <button onClick={() => setEditingOffering(i)} className="p-1 hover:bg-slate-700 rounded-lg"><Edit size={18}/></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button onClick={() => { setOfferings([...offerings, { name: 'New Service', keywords: ['keyword'], defaultRate: 100 }]); setEditingOffering(offerings.length); }}
              className="w-full py-2 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center justify-center gap-2"><Plus size={18}/> Add Category</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
