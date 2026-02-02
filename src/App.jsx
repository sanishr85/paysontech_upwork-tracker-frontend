import React, { useState, useEffect, useCallback } from 'react';
import { 
  Search, TrendingUp, Clock, Zap, FileText, 
  DollarSign, AlertCircle, CheckCircle, XCircle, Settings, 
  Plus, Trash2, Edit, RefreshCw, Wifi, WifiOff, ExternalLink, 
  Copy, Bookmark, Star, Shield, User, MapPin, Send, Users,
  ThumbsUp, Eye, PenTool, Download, HelpCircle, BarChart3, Target,
  LayoutDashboard, ArrowUpRight, ArrowDownRight, Minus, Trophy, TrendingDown
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
  
  const [activeTab, setActiveTab] = useState('summary');
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

  // Get all our skills across categories
  const getAllOurSkills = () => {
    return [...new Set(offerings.flatMap(o => o.skills || []).map(s => s.toLowerCase()))];
  };

  // Calculate project fit score
  const calculateProjectFit = (project) => {
    const ourSkills = getAllOurSkills();
    const projectSkills = (project.skills || []).map(s => s.toLowerCase());
    
    // Skills match
    const matchedSkills = projectSkills.filter(ps => 
      ourSkills.some(os => os.includes(ps) || ps.includes(os))
    );
    const skillMatch = projectSkills.length > 0 ? matchedSkills.length / projectSkills.length : 0.5;
    
    // Budget tier
    let budgetTier = 'low';
    let budgetScore = 0.3;
    if (project.budgetMax >= 5000 || (project.isHourly && project.budgetMax >= 75)) {
      budgetTier = 'high';
      budgetScore = 1;
    } else if (project.budgetMax >= 1000 || (project.isHourly && project.budgetMax >= 40)) {
      budgetTier = 'medium';
      budgetScore = 0.7;
    }
    
    // Complexity estimate
    let complexity = 'medium';
    const descLength = (project.description || '').length;
    const skillCount = projectSkills.length;
    if (descLength > 1500 || skillCount > 6) complexity = 'high';
    else if (descLength < 500 && skillCount <= 3) complexity = 'low';
    
    // Timeline estimate
    let timeline = '2-4 weeks';
    let timelineScore = 0.7;
    if (project.estimatedHours <= 20) { timeline = '< 1 week'; timelineScore = 1; }
    else if (project.estimatedHours <= 40) { timeline = '1-2 weeks'; timelineScore = 0.9; }
    else if (project.estimatedHours <= 80) { timeline = '2-4 weeks'; timelineScore = 0.7; }
    else { timeline = '1+ month'; timelineScore = 0.5; }
    
    // Client quality
    let clientScore = 0.5;
    if (project.client?.paymentVerified) clientScore += 0.2;
    if (project.client?.totalSpent > 10000) clientScore += 0.2;
    if (project.client?.feedbackRate >= 4.5) clientScore += 0.1;
    
    // Overall recommendation score (0-100)
    const recommendationScore = Math.round(
      (skillMatch * 35) + 
      (budgetScore * 25) + 
      (clientScore * 20) + 
      (timelineScore * 10) +
      ((project.matchScore || 60) / 100 * 10)
    );
    
    // Recommendation
    let recommendation = 'CONSIDER';
    if (recommendationScore >= 75 && skillMatch >= 0.7) recommendation = 'STRONG BID';
    else if (recommendationScore >= 60 && skillMatch >= 0.5) recommendation = 'BID';
    else if (recommendationScore < 40 || skillMatch < 0.3) recommendation = 'SKIP';
    
    return {
      skillMatch: Math.round(skillMatch * 100),
      matchedSkills,
      missingSkills: projectSkills.filter(ps => !matchedSkills.includes(ps)).map(s => project.skills.find(orig => orig.toLowerCase() === s) || s),
      budgetTier,
      complexity,
      timeline,
      clientScore: Math.round(clientScore * 100),
      recommendationScore,
      recommendation
    };
  };

  // Analyze all projects for summary
  const analyzeSummary = () => {
    const realProjects = projects.filter(p => !p.isInstruction);
    
    // Add fit analysis to each project
    const analyzed = realProjects.map(p => ({
      ...p,
      fit: calculateProjectFit(p)
    }));
    
    // Budget breakdown
    const budgetBreakdown = {
      high: analyzed.filter(p => p.fit.budgetTier === 'high'),
      medium: analyzed.filter(p => p.fit.budgetTier === 'medium'),
      low: analyzed.filter(p => p.fit.budgetTier === 'low')
    };
    
    // Complexity breakdown
    const complexityBreakdown = {
      high: analyzed.filter(p => p.fit.complexity === 'high'),
      medium: analyzed.filter(p => p.fit.complexity === 'medium'),
      low: analyzed.filter(p => p.fit.complexity === 'low')
    };
    
    // Timeline breakdown
    const timelineBreakdown = {
      '< 1 week': analyzed.filter(p => p.fit.timeline === '< 1 week'),
      '1-2 weeks': analyzed.filter(p => p.fit.timeline === '1-2 weeks'),
      '2-4 weeks': analyzed.filter(p => p.fit.timeline === '2-4 weeks'),
      '1+ month': analyzed.filter(p => p.fit.timeline === '1+ month')
    };
    
    // Recommendation breakdown
    const recommendations = {
      strongBid: analyzed.filter(p => p.fit.recommendation === 'STRONG BID'),
      bid: analyzed.filter(p => p.fit.recommendation === 'BID'),
      consider: analyzed.filter(p => p.fit.recommendation === 'CONSIDER'),
      skip: analyzed.filter(p => p.fit.recommendation === 'SKIP')
    };
    
    // Top recommended (sorted by score)
    const topRecommended = [...analyzed]
      .filter(p => p.fit.recommendation !== 'SKIP')
      .sort((a, b) => b.fit.recommendationScore - a.fit.recommendationScore)
      .slice(0, 10);
    
    // Best skill matches
    const bestSkillMatches = [...analyzed]
      .sort((a, b) => b.fit.skillMatch - a.fit.skillMatch)
      .slice(0, 10);
    
    // High budget opportunities
    const highBudget = [...analyzed]
      .filter(p => p.fit.budgetTier === 'high')
      .sort((a, b) => b.fit.recommendationScore - a.fit.recommendationScore);
    
    // Quick wins (low complexity + good match)
    const quickWins = analyzed
      .filter(p => p.fit.complexity === 'low' && p.fit.skillMatch >= 50)
      .sort((a, b) => b.fit.recommendationScore - a.fit.recommendationScore)
      .slice(0, 5);
    
    return {
      total: analyzed.length,
      analyzed,
      budgetBreakdown,
      complexityBreakdown,
      timelineBreakdown,
      recommendations,
      topRecommended,
      bestSkillMatches,
      highBudget,
      quickWins
    };
  };

  // Skills Gap Analysis
  const analyzeSkillsGap = () => {
    const realProjects = projects.filter(p => !p.isInstruction);
    const allOurSkills = offerings.flatMap(o => o.skills || []).map(s => s.toLowerCase());
    const uniqueOurSkills = [...new Set(allOurSkills)];
    
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
      if (hasSkill) matched.push(entry);
      else missing.push(entry);
    });
    
    matched.sort((a, b) => b.demand - a.demand);
    missing.sort((a, b) => b.demand - a.demand);
    
    const totalDemand = Object.values(skillDemand).reduce((a, b) => a + b, 0);
    const coveredDemand = matched.reduce((sum, s) => sum + s.demand, 0);
    const coverage = totalDemand > 0 ? Math.round((coveredDemand / totalDemand) * 100) : 0;
    
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

  const summary = analyzeSummary();
  const skillsAnalysis = analyzeSkillsGap();

  const getTimeAgo = (date) => { const h = Math.floor((Date.now() - new Date(date)) / 3600000); return h < 1 ? 'Just now' : h < 24 ? `${h}h ago` : `${Math.floor(h/24)}d ago`; };
  const getRecommendationColor = (rec) => { if (rec === 'STRONG BID') return 'bg-emerald-500 text-white'; if (rec === 'BID') return 'bg-blue-500 text-white'; if (rec === 'CONSIDER') return 'bg-amber-500 text-white'; if (rec === 'SKIP') return 'bg-red-500 text-white'; return 'bg-slate-500 text-white'; };
  const getRecommendationBorder = (rec) => { if (rec === 'STRONG BID') return 'border-emerald-500'; if (rec === 'BID') return 'border-blue-500'; if (rec === 'CONSIDER') return 'border-amber-500'; return 'border-slate-500'; };

  useEffect(() => { checkProxyStatus(); fetchProjects(); const i1 = setInterval(checkProxyStatus, 30000); const i2 = setInterval(fetchProjects, 300000); return () => { clearInterval(i1); clearInterval(i2); }; }, []);

  // Mini project card for summary view
  const MiniProjectCard = ({ project, showFit = true }) => {
    const fit = project.fit || calculateProjectFit(project);
    return (
      <div 
        className={`glass rounded-lg p-3 cursor-pointer hover:border-indigo-500/50 transition-all border-l-4 ${getRecommendationBorder(fit.recommendation)}`}
        onClick={() => setSelectedProject(project)}
      >
        <div className="flex justify-between items-start mb-2">
          <h4 className="font-medium text-sm line-clamp-1 flex-1 pr-2">{project.title}</h4>
          <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${getRecommendationColor(fit.recommendation)}`}>{fit.recommendation}</span>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-slate-400">
          <span className="flex items-center gap-1"><DollarSign size={12}/>{project.budget}</span>
          <span className="flex items-center gap-1"><Clock size={12}/>{fit.timeline}</span>
          <span className={`${fit.skillMatch >= 70 ? 'text-emerald-400' : fit.skillMatch >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>{fit.skillMatch}% skill match</span>
        </div>
        {showFit && fit.missingSkills.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {fit.missingSkills.slice(0, 3).map((s, i) => <span key={i} className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 text-xs rounded">{s}</span>)}
            {fit.missingSkills.length > 3 && <span className="text-slate-500 text-xs">+{fit.missingSkills.length - 3}</span>}
          </div>
        )}
      </div>
    );
  };

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
          <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
            <button onClick={() => setActiveTab('summary')} className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 whitespace-nowrap ${activeTab === 'summary' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
              <LayoutDashboard size={18}/> Summary
            </button>
            <button onClick={() => setActiveTab('projects')} className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 whitespace-nowrap ${activeTab === 'projects' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
              <FileText size={18}/> All Projects
            </button>
            <button onClick={() => setActiveTab('skills')} className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 whitespace-nowrap ${activeTab === 'skills' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
              <BarChart3 size={18}/> Skills Gap
              {skillsAnalysis.missing.length > 0 && <span className="px-2 py-0.5 bg-amber-500 text-white text-xs rounded-full">{skillsAnalysis.missing.length}</span>}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-4">
        
        {/* SUMMARY TAB */}
        {activeTab === 'summary' && (
          <div className="space-y-6">
            {/* Key Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              <div className="glass rounded-xl p-4">
                <p className="text-slate-400 text-xs mb-1">Total Projects</p>
                <p className="text-2xl font-bold">{summary.total}</p>
              </div>
              <div className="glass rounded-xl p-4">
                <p className="text-slate-400 text-xs mb-1">Strong Bids</p>
                <p className="text-2xl font-bold text-emerald-400">{summary.recommendations.strongBid.length}</p>
              </div>
              <div className="glass rounded-xl p-4">
                <p className="text-slate-400 text-xs mb-1">Recommended Bids</p>
                <p className="text-2xl font-bold text-blue-400">{summary.recommendations.bid.length}</p>
              </div>
              <div className="glass rounded-xl p-4">
                <p className="text-slate-400 text-xs mb-1">High Budget</p>
                <p className="text-2xl font-bold text-purple-400">{summary.budgetBreakdown.high.length}</p>
              </div>
              <div className="glass rounded-xl p-4">
                <p className="text-slate-400 text-xs mb-1">Quick Wins</p>
                <p className="text-2xl font-bold text-cyan-400">{summary.quickWins.length}</p>
              </div>
              <div className="glass rounded-xl p-4">
                <p className="text-slate-400 text-xs mb-1">Skill Coverage</p>
                <p className="text-2xl font-bold">{skillsAnalysis.coverage}%</p>
              </div>
            </div>

            {/* Breakdown Charts */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Budget Breakdown */}
              <div className="glass rounded-xl p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2"><DollarSign size={18} className="text-purple-400"/> Budget Breakdown</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2"><ArrowUpRight size={14} className="text-emerald-400"/> High ($5k+ / $75+/hr)</span>
                    <span className="font-bold text-emerald-400">{summary.budgetBreakdown.high.length}</span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2"><div className="bg-emerald-500 h-2 rounded-full" style={{width: `${(summary.budgetBreakdown.high.length / summary.total * 100) || 0}%`}}></div></div>
                  
                  <div className="flex items-center justify-between mt-2">
                    <span className="flex items-center gap-2"><Minus size={14} className="text-amber-400"/> Medium ($1k-5k / $40-75/hr)</span>
                    <span className="font-bold text-amber-400">{summary.budgetBreakdown.medium.length}</span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2"><div className="bg-amber-500 h-2 rounded-full" style={{width: `${(summary.budgetBreakdown.medium.length / summary.total * 100) || 0}%`}}></div></div>
                  
                  <div className="flex items-center justify-between mt-2">
                    <span className="flex items-center gap-2"><ArrowDownRight size={14} className="text-slate-400"/> Low (< $1k / < $40/hr)</span>
                    <span className="font-bold text-slate-400">{summary.budgetBreakdown.low.length}</span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2"><div className="bg-slate-500 h-2 rounded-full" style={{width: `${(summary.budgetBreakdown.low.length / summary.total * 100) || 0}%`}}></div></div>
                </div>
              </div>

              {/* Complexity Breakdown */}
              <div className="glass rounded-xl p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2"><Target size={18} className="text-blue-400"/> Complexity</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-rose-400">High (6+ skills, detailed)</span>
                    <span className="font-bold text-rose-400">{summary.complexityBreakdown.high.length}</span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2"><div className="bg-rose-500 h-2 rounded-full" style={{width: `${(summary.complexityBreakdown.high.length / summary.total * 100) || 0}%`}}></div></div>
                  
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-amber-400">Medium</span>
                    <span className="font-bold text-amber-400">{summary.complexityBreakdown.medium.length}</span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2"><div className="bg-amber-500 h-2 rounded-full" style={{width: `${(summary.complexityBreakdown.medium.length / summary.total * 100) || 0}%`}}></div></div>
                  
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-emerald-400">Low (quick projects)</span>
                    <span className="font-bold text-emerald-400">{summary.complexityBreakdown.low.length}</span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2"><div className="bg-emerald-500 h-2 rounded-full" style={{width: `${(summary.complexityBreakdown.low.length / summary.total * 100) || 0}%`}}></div></div>
                </div>
              </div>

              {/* Timeline Breakdown */}
              <div className="glass rounded-xl p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2"><Clock size={18} className="text-cyan-400"/> Delivery Timeline</h3>
                <div className="space-y-2">
                  {Object.entries(summary.timelineBreakdown).map(([timeline, projs]) => (
                    <div key={timeline}>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-300">{timeline}</span>
                        <span className="font-bold">{projs.length}</span>
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-2"><div className="bg-cyan-500 h-2 rounded-full" style={{width: `${(projs.length / summary.total * 100) || 0}%`}}></div></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Recommendation Sections */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top Recommended - STRONG BID */}
              <div className="glass rounded-xl p-5">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                  <Trophy className="text-emerald-400"/> Top Recommended to Bid
                  <span className="text-xs text-slate-400 font-normal ml-2">Best skill match + budget + client</span>
                </h3>
                {summary.topRecommended.length === 0 ? (
                  <p className="text-slate-400 text-sm">No strong recommendations yet. Add more skills to your categories.</p>
                ) : (
                  <div className="space-y-3">
                    {summary.topRecommended.slice(0, 5).map((project, i) => (
                      <MiniProjectCard key={project.id} project={project} />
                    ))}
                  </div>
                )}
              </div>

              {/* Quick Wins */}
              <div className="glass rounded-xl p-5">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                  <Zap className="text-cyan-400"/> Quick Wins
                  <span className="text-xs text-slate-400 font-normal ml-2">Low complexity + good match</span>
                </h3>
                {summary.quickWins.length === 0 ? (
                  <p className="text-slate-400 text-sm">No quick win projects found.</p>
                ) : (
                  <div className="space-y-3">
                    {summary.quickWins.map((project, i) => (
                      <MiniProjectCard key={project.id} project={project} />
                    ))}
                  </div>
                )}
              </div>

              {/* High Budget Opportunities */}
              <div className="glass rounded-xl p-5">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                  <DollarSign className="text-purple-400"/> High Budget Opportunities
                  <span className="text-xs text-slate-400 font-normal ml-2">$5k+ or $75+/hr</span>
                </h3>
                {summary.highBudget.length === 0 ? (
                  <p className="text-slate-400 text-sm">No high budget projects found.</p>
                ) : (
                  <div className="space-y-3">
                    {summary.highBudget.slice(0, 5).map((project, i) => (
                      <MiniProjectCard key={project.id} project={project} />
                    ))}
                  </div>
                )}
              </div>

              {/* Best Skill Matches */}
              <div className="glass rounded-xl p-5">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                  <CheckCircle className="text-emerald-400"/> Best Skill Matches
                  <span className="text-xs text-slate-400 font-normal ml-2">Highest skill coverage</span>
                </h3>
                {summary.bestSkillMatches.length === 0 ? (
                  <p className="text-slate-400 text-sm">No projects analyzed yet.</p>
                ) : (
                  <div className="space-y-3">
                    {summary.bestSkillMatches.slice(0, 5).map((project, i) => (
                      <MiniProjectCard key={project.id} project={project} showFit={false} />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Recommendation Distribution */}
            <div className="glass rounded-xl p-5">
              <h3 className="font-bold text-lg mb-4">Recommendation Distribution</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                  <p className="text-3xl font-bold text-emerald-400">{summary.recommendations.strongBid.length}</p>
                  <p className="text-sm text-slate-400 mt-1">STRONG BID</p>
                  <p className="text-xs text-slate-500">High match, good budget</p>
                </div>
                <div className="text-center p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                  <p className="text-3xl font-bold text-blue-400">{summary.recommendations.bid.length}</p>
                  <p className="text-sm text-slate-400 mt-1">BID</p>
                  <p className="text-xs text-slate-500">Good opportunity</p>
                </div>
                <div className="text-center p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <p className="text-3xl font-bold text-amber-400">{summary.recommendations.consider.length}</p>
                  <p className="text-sm text-slate-400 mt-1">CONSIDER</p>
                  <p className="text-xs text-slate-500">Review carefully</p>
                </div>
                <div className="text-center p-4 bg-slate-500/10 border border-slate-500/30 rounded-lg">
                  <p className="text-3xl font-bold text-slate-400">{summary.recommendations.skip.length}</p>
                  <p className="text-sm text-slate-400 mt-1">SKIP</p>
                  <p className="text-xs text-slate-500">Low match/budget</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PROJECTS TAB */}
        {activeTab === 'projects' && (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
              {[{ icon: FileText, label: 'Projects', value: `${stats.filtered}/${stats.total}`, color: 'blue' }, { icon: TrendingUp, label: 'Avg Match', value: `${stats.avgMatch}%`, color: 'emerald' }, { icon: DollarSign, label: 'Potential', value: `$${(stats.potential/1000).toFixed(0)}k`, color: 'purple' }, { icon: Bookmark, label: 'Saved', value: stats.saved, color: 'amber' }, { icon: Send, label: 'Applied', value: stats.applied, color: 'cyan' }, { icon: Zap, label: 'Proposals', value: stats.proposals, color: 'rose' }].map((s, i) => (
                <div key={i} className="glass rounded-xl p-2 sm:p-3 flex items-center gap-2"><s.icon size={16} className={`text-${s.color}-400 hidden sm:block`}/><div><p className="text-slate-400 text-xs">{s.label}</p><p className="text-sm sm:text-lg font-bold">{s.value}</p></div></div>
              ))}
            </div>
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
                const fit = calculateProjectFit(project);
                
                return (
                  <div key={project.id} className={`glass rounded-xl p-4 ${project.isInstruction ? 'border-2 border-amber-500/50' : `cursor-pointer hover:border-indigo-500/50 border-l-4 ${getRecommendationBorder(fit.recommendation)}`} ${isApplied ? 'ring-2 ring-cyan-500/30' : ''}`} onClick={() => !project.isInstruction && setSelectedProject(project)}>
                    {project.isInstruction ? (
                      <div><h3 className="text-lg font-semibold mb-2 text-amber-400">{project.title}</h3><p className="text-slate-300 text-sm whitespace-pre-line mb-4">{project.description}</p><a href={project.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 rounded-lg text-sm">Browse Upwork <ExternalLink size={16}/></a></div>
                    ) : (
                      <>
                        <div className="flex justify-between mb-2">
                          <div className="flex-1 pr-2">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${getRecommendationColor(fit.recommendation)}`}>{fit.recommendation}</span>
                              <span className="text-xs text-slate-400">{getTimeAgo(project.postedDate)}</span>
                              <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 text-xs rounded-full">{project.category}</span>
                              {project.client?.paymentVerified && <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-xs rounded-full flex items-center gap-1"><Shield size={10}/>Verified</span>}
                              {isApplied && <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-300 text-xs rounded-full">Applied</span>}
                              {hasRecommendation && <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-xs rounded-full flex items-center gap-1"><ThumbsUp size={10}/></span>}
                            </div>
                            <h3 className="font-semibold mb-1 line-clamp-2">{project.title}</h3>
                            <p className="text-slate-400 text-sm line-clamp-2">{project.description}</p>
                          </div>
                          <div className="flex flex-col items-center gap-1">
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-sm">{fit.skillMatch}%</div>
                            <span className="text-xs text-slate-500">skill</span>
                            <div className="flex gap-1">
                              <button onClick={e => { e.stopPropagation(); toggleSave(project); }} className={isSaved ? 'text-amber-400' : 'text-slate-500 hover:text-amber-400'}>{isSaved ? <Star size={14} fill="currentColor"/> : <Bookmark size={14}/>}</button>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs mb-2">
                          <span className={`px-2 py-1 rounded ${fit.budgetTier === 'high' ? 'bg-emerald-500/20 text-emerald-300' : fit.budgetTier === 'medium' ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-700 text-slate-400'}`}>
                            {fit.budgetTier.toUpperCase()} Budget
                          </span>
                          <span className={`px-2 py-1 rounded ${fit.complexity === 'low' ? 'bg-emerald-500/20 text-emerald-300' : fit.complexity === 'medium' ? 'bg-amber-500/20 text-amber-300' : 'bg-rose-500/20 text-rose-300'}`}>
                            {fit.complexity.toUpperCase()} Complexity
                          </span>
                          <span className="px-2 py-1 bg-slate-700 text-slate-300 rounded">{fit.timeline}</span>
                        </div>
                        {project.skills?.length > 0 && <div className="flex flex-wrap gap-1 mb-2">{project.skills.slice(0, 4).map((s, i) => <span key={i} className={`px-2 py-0.5 text-xs rounded ${fit.matchedSkills.some(ms => ms.toLowerCase() === s.toLowerCase()) ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700/50 text-slate-400'}`}>{s}</span>)}{project.skills.length > 4 && <span className="text-slate-500 text-xs">+{project.skills.length - 4}</span>}</div>}
                        <div className="flex items-center gap-3 mb-3 text-sm flex-wrap">
                          <span className="flex items-center gap-1"><DollarSign size={14} className="text-slate-500"/>{project.budget}</span>
                          {project.client?.totalSpent > 0 && <span className="text-emerald-400 flex items-center gap-1"><User size={14}/>${(project.client.totalSpent/1000).toFixed(0)}k spent</span>}
                        </div>
                        <div className="flex gap-2">
                          {proposals[project.id] ? (
                            <button className="flex-1 px-3 py-2 bg-emerald-600/20 border border-emerald-600/30 text-emerald-300 rounded-lg text-sm flex items-center justify-center gap-1" onClick={e => { e.stopPropagation(); setSelectedProject(project); }}><Eye size={14}/> View</button>
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

        {/* SKILLS GAP TAB */}
        {activeTab === 'skills' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="glass rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2"><Target size={20} className="text-emerald-400"/><span className="text-slate-400 text-sm">Coverage</span></div>
                <p className="text-3xl font-bold">{skillsAnalysis.coverage}%</p>
              </div>
              <div className="glass rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2"><CheckCircle size={20} className="text-emerald-400"/><span className="text-slate-400 text-sm">Skills Have</span></div>
                <p className="text-3xl font-bold text-emerald-400">{skillsAnalysis.matched.length}</p>
              </div>
              <div className="glass rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2"><AlertCircle size={20} className="text-amber-400"/><span className="text-slate-400 text-sm">Missing</span></div>
                <p className="text-3xl font-bold text-amber-400">{skillsAnalysis.missing.length}</p>
              </div>
              <div className="glass rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2"><TrendingDown size={20} className="text-rose-400"/><span className="text-slate-400 text-sm">Missed Rev</span></div>
                <p className="text-3xl font-bold text-rose-400">${(skillsAnalysis.missedRevenue/1000).toFixed(0)}k</p>
              </div>
            </div>

            <div className="glass rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2"><AlertCircle className="text-amber-400"/> Skills Gap</h2>
                  <p className="text-slate-400 text-sm mt-1">Add these skills to win more projects</p>
                </div>
                <button onClick={fetchProjects} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg flex items-center gap-2 text-sm"><RefreshCw size={16}/> Refresh</button>
              </div>
              
              {skillsAnalysis.missing.length === 0 ? (
                <div className="text-center py-8"><CheckCircle size={48} className="mx-auto text-emerald-400 mb-3"/><p className="text-emerald-400 font-semibold">You have all demanded skills!</p></div>
              ) : (
                <div className="space-y-3">
                  {skillsAnalysis.missing.slice(0, 15).map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-amber-300">{item.skill}</span>
                          <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 text-xs rounded-full">{item.demand} projects</span>
                        </div>
                      </div>
                      <select onChange={e => { if (e.target.value !== '') { addSkillToCategory(item.skill, parseInt(e.target.value)); e.target.value = ''; }}} className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-sm" defaultValue="">
                        <option value="" disabled>Add to...</option>
                        {offerings.map((o, idx) => <option key={idx} value={idx}>{o.name}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="glass rounded-xl p-6">
              <h2 className="text-xl font-bold flex items-center gap-2 mb-4"><CheckCircle className="text-emerald-400"/> Skills We Have</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {skillsAnalysis.matched.map((item, i) => (
                  <div key={i} className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                    <p className="font-medium text-emerald-300">{item.skill}</p>
                    <p className="text-slate-400 text-xs mt-1">{item.demand} projects</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Project Modal - Compact version */}
      {selectedProject && !selectedProject.isInstruction && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => setSelectedProject(null)}>
          <div className="glass rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className={`px-2 py-0.5 text-sm rounded-full font-medium ${getRecommendationColor(calculateProjectFit(selectedProject).recommendation)}`}>{calculateProjectFit(selectedProject).recommendation}</span>
                  <span className="text-sm text-slate-400">{getTimeAgo(selectedProject.postedDate)}</span>
                  {selectedProject.client?.country && <span className="px-2 py-0.5 bg-slate-700 text-slate-300 text-sm rounded-full flex items-center gap-1"><MapPin size={12}/>{selectedProject.client.country}</span>}
                </div>
                <h2 className="text-xl font-bold">{selectedProject.title}</h2>
              </div>
              <button onClick={() => setSelectedProject(null)} className="p-1 hover:bg-slate-700 rounded-lg h-fit"><XCircle size={24}/></button>
            </div>
            <p className="text-slate-300 text-sm mb-4 max-h-32 overflow-y-auto">{selectedProject.description}</p>
            
            {/* Quick Fit Summary */}
            {(() => { const fit = calculateProjectFit(selectedProject); return (
              <div className="grid grid-cols-4 gap-2 mb-4">
                <div className="glass rounded-lg p-2 text-center"><p className="text-xs text-slate-500">Skill Match</p><p className="font-bold text-lg">{fit.skillMatch}%</p></div>
                <div className="glass rounded-lg p-2 text-center"><p className="text-xs text-slate-500">Budget</p><p className="font-bold text-lg capitalize">{fit.budgetTier}</p></div>
                <div className="glass rounded-lg p-2 text-center"><p className="text-xs text-slate-500">Complexity</p><p className="font-bold text-lg capitalize">{fit.complexity}</p></div>
                <div className="glass rounded-lg p-2 text-center"><p className="text-xs text-slate-500">Timeline</p><p className="font-bold text-lg">{fit.timeline}</p></div>
              </div>
            );})()}
            
            <div className="glass rounded-lg p-3 mb-4">
              <div className="flex flex-wrap gap-4 text-sm">
                <span>Budget: <strong>{selectedProject.budget}</strong></span>
                {selectedProject.client?.totalSpent > 0 && <span className="text-emerald-400">${(selectedProject.client.totalSpent/1000).toFixed(0)}k spent</span>}
                {selectedProject.client?.paymentVerified && <span className="text-emerald-400 flex items-center gap-1"><Shield size={12}/>Verified</span>}
              </div>
            </div>
            
            {selectedProject.skills?.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-slate-500 mb-2">SKILLS (green = we have)</p>
                <div className="flex flex-wrap gap-1">
                  {selectedProject.skills.map((s, i) => {
                    const fit = calculateProjectFit(selectedProject);
                    const hasSkill = fit.matchedSkills.some(ms => ms.toLowerCase() === s.toLowerCase());
                    return <span key={i} className={`px-2 py-1 text-xs rounded ${hasSkill ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>{s}</span>;
                  })}
                </div>
              </div>
            )}

            {proposals[selectedProject.id] ? (
              <div className="space-y-4">
                <div className={`rounded-lg p-4 ${getRecommendationColor(proposals[selectedProject.id].analysis?.recommendation)}`}>
                  <div className="flex items-center justify-between">
                    <div><p className="text-xs opacity-80">AI ANALYSIS</p><p className="text-xl font-bold">{proposals[selectedProject.id].analysis?.recommendation || 'REVIEW'}</p></div>
                    <div className="text-right"><p className="text-xs opacity-80">CONFIDENCE</p><p className="text-2xl font-bold">{proposals[selectedProject.id].analysis?.confidenceScore || 0}%</p></div>
                  </div>
                  <p className="text-sm mt-2 opacity-90">{proposals[selectedProject.id].analysis?.recommendationReason}</p>
                </div>
                
                {proposals[selectedProject.id].analysis?.confidenceBreakdown?.length > 0 && (
                  <div className="glass rounded-lg p-4">
                    <p className="text-xs text-slate-500 mb-2"><HelpCircle size={12} className="inline"/> WHY THIS SCORE?</p>
                    <ul className="text-sm text-slate-300 space-y-1">{proposals[selectedProject.id].analysis.confidenceBreakdown.map((item, i) => <li key={i} className="flex items-center gap-2"><CheckCircle size={12} className="text-emerald-400"/>{item}</li>)}</ul>
                  </div>
                )}
                
                <div className="glass rounded-lg p-4"><p className="text-xs text-slate-500 mb-2">SUMMARY</p><p className="text-slate-200 text-sm">{proposals[selectedProject.id].analysis?.projectSummary}</p></div>
                
                <div className="grid grid-cols-4 gap-2">
                  <div className="glass rounded-lg p-3"><p className="text-xs text-slate-500">Hours</p><p className="text-lg font-bold">{proposals[selectedProject.id].analysis?.estimatedHours}h</p></div>
                  <div className="glass rounded-lg p-3"><p className="text-xs text-slate-500">Complexity</p><p className="text-lg font-bold">{proposals[selectedProject.id].analysis?.complexity}</p></div>
                  <div className="glass rounded-lg p-3"><p className="text-xs text-slate-500">Rate</p><p className="text-lg font-bold">${proposals[selectedProject.id].offering?.rateMin}-{proposals[selectedProject.id].offering?.rateMax}</p></div>
                  <div className="glass rounded-lg p-3"><p className="text-xs text-slate-500">Estimate</p><p className="text-lg font-bold gradient-text">${(proposals[selectedProject.id].analysis?.totalEstimateMin/1000).toFixed(1)}k</p></div>
                </div>
                
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-xs text-slate-500">PROPOSAL</p>
                    <div className="flex gap-2">
                      <button onClick={() => exportToCSV(selectedProject, proposals[selectedProject.id])} className="flex items-center gap-1 px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm"><Download size={14}/></button>
                      <button onClick={() => copyProposal(proposals[selectedProject.id].proposal, selectedProject.id)} className="flex items-center gap-1 px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm">{copiedId === selectedProject.id ? <CheckCircle size={14}/> : <Copy size={14}/>}</button>
                    </div>
                  </div>
                  <div className="glass rounded-lg p-4 max-h-40 overflow-y-auto"><p className="text-slate-200 text-sm whitespace-pre-wrap">{proposals[selectedProject.id].proposal}</p></div>
                </div>
                
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => generateProposal(selectedProject)} disabled={generatingProposal} className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center justify-center gap-1 disabled:opacity-50"><RefreshCw size={14} className={generatingProposal ? 'animate-spin' : ''}/> Regenerate</button>
                  <button onClick={() => toggleApplied(selectedProject)} className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1 ${appliedProjects.some(p => p.id === selectedProject.id) ? 'bg-cyan-600' : 'bg-slate-700 hover:bg-slate-600'}`}><Send size={14}/> {appliedProjects.some(p => p.id === selectedProject.id) ? 'Applied ✓' : 'Applied'}</button>
                  <a href={selectedProject.link} target="_blank" rel="noopener noreferrer" className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-center flex items-center justify-center gap-1">Apply <ExternalLink size={14}/></a>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <button onClick={() => generateProposal(selectedProject)} disabled={generatingProposal} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-semibold flex items-center justify-center gap-2 mx-auto disabled:opacity-50"><Zap size={18} className={generatingProposal ? 'animate-pulse' : ''}/> {generatingProposal ? 'Analyzing...' : 'Analyze & Generate'}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Template Editor */}
      {showTemplateEditor && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => setShowTemplateEditor(false)}>
          <div className="glass rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between mb-4"><h2 className="text-xl font-bold">Edit Template</h2><button onClick={() => setShowTemplateEditor(false)} className="p-1 hover:bg-slate-700 rounded-lg"><XCircle size={24}/></button></div>
            <div className="mb-4"><label className="block text-sm text-slate-400 mb-2">Your Name</label><input type="text" value={userName} onChange={e => setUserName(e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg"/></div>
            <div className="mb-4"><label className="block text-sm text-slate-400 mb-2">Proposal Template</label><textarea value={proposalTemplate} onChange={e => setProposalTemplate(e.target.value)} rows={12} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-mono"/></div>
            <div className="flex gap-2"><button onClick={() => setProposalTemplate(DEFAULT_PROPOSAL_TEMPLATE)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg">Reset</button><button onClick={() => setShowTemplateEditor(false)} className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg">Save</button></div>
          </div>
        </div>
      )}

      {/* Settings */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => setShowSettings(false)}>
          <div className="glass rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between mb-4"><h2 className="text-xl font-bold">Service Categories</h2><button onClick={() => setShowSettings(false)} className="p-1 hover:bg-slate-700 rounded-lg"><XCircle size={24}/></button></div>
            <div className="space-y-3 mb-4">
              {offerings.map((o, i) => (
                <div key={i} className="glass rounded-lg p-4">
                  {editingOffering === i ? (
                    <div className="space-y-3">
                      <input type="text" value={o.name} onChange={e => { const u = [...offerings]; u[i].name = e.target.value; setOfferings(u); }} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg"/>
                      <textarea value={o.keywords.join(', ')} onChange={e => { const u = [...offerings]; u[i].keywords = e.target.value.split(',').map(k => k.trim()).filter(k => k); setOfferings(u); }} rows={2} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm" placeholder="Keywords"/>
                      <div className="grid grid-cols-2 gap-2">
                        <div><label className="text-xs text-slate-400">Min Rate</label><input type="number" value={o.rateMin} onChange={e => { const u = [...offerings]; u[i].rateMin = parseFloat(e.target.value) || 0; setOfferings(u); }} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg"/></div>
                        <div><label className="text-xs text-slate-400">Max Rate</label><input type="number" value={o.rateMax} onChange={e => { const u = [...offerings]; u[i].rateMax = parseFloat(e.target.value) || 0; setOfferings(u); }} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg"/></div>
                      </div>
                      <div><label className="text-xs text-slate-400">Skills</label><textarea value={o.skills?.join(', ') || ''} onChange={e => { const u = [...offerings]; u[i].skills = e.target.value.split(',').map(k => k.trim()).filter(k => k); setOfferings(u); }} rows={3} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm"/></div>
                      <div className="flex gap-2"><button onClick={() => setEditingOffering(null)} className="flex-1 py-2 bg-indigo-600 rounded-lg">Done</button><button onClick={() => { setOfferings(offerings.filter((_, j) => j !== i)); setEditingOffering(null); }} className="px-3 py-2 bg-rose-600/20 text-rose-300 rounded-lg"><Trash2 size={18}/></button></div>
                    </div>
                  ) : (
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold mb-1">{o.name}</h3>
                        <p className="text-slate-400 text-sm mb-2">${o.rateMin}-${o.rateMax}/hr</p>
                        <div className="flex flex-wrap gap-1">{o.skills?.slice(0, 5).map((s, j) => <span key={j} className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-xs rounded-full">{s}</span>)}{o.skills?.length > 5 && <span className="text-slate-500 text-xs">+{o.skills.length - 5}</span>}</div>
                      </div>
                      <button onClick={() => setEditingOffering(i)} className="p-1 hover:bg-slate-700 rounded-lg"><Edit size={18}/></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button onClick={() => { setOfferings([...offerings, { name: 'New Service', keywords: ['keyword'], rateMin: 50, rateMax: 100, skills: [] }]); setEditingOffering(offerings.length); }} className="w-full py-2 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center justify-center gap-2"><Plus size={18}/> Add</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
