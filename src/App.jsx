import React, { useState, useEffect, useCallback } from 'react';
import { 
  Search, TrendingUp, Clock, Users, Calendar, Zap, FileText, 
  DollarSign, AlertCircle, CheckCircle, XCircle, Settings, 
  Plus, Trash2, Edit, RefreshCw, Wifi, WifiOff, ExternalLink, 
  Copy, Star, Bookmark 
} from 'lucide-react';
import { API_URL, DEFAULT_OFFERINGS } from './config';

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
      const saved = localStorage.getItem('upwork_saved_projects');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  
  const [offerings, setOfferings] = useState(() => {
    try {
      const saved = localStorage.getItem('upwork_offerings');
      return saved ? JSON.parse(saved) : DEFAULT_OFFERINGS;
    } catch {
      return DEFAULT_OFFERINGS;
    }
  });
  
  const [showSettings, setShowSettings] = useState(false);
  const [editingOffering, setEditingOffering] = useState(null);
  const [customRate, setCustomRate] = useState('');
  const [showRateInput, setShowRateInput] = useState(false);
  const [sortBy, setSortBy] = useState('date');

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('upwork_offerings', JSON.stringify(offerings));
  }, [offerings]);

  useEffect(() => {
    localStorage.setItem('upwork_saved_projects', JSON.stringify(savedProjects));
  }, [savedProjects]);

  // Check proxy status
  const checkProxyStatus = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(API_URL, { 
        signal: controller.signal,
        mode: 'cors'
      });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        setProxyStatus('online');
        return true;
      }
      setProxyStatus('offline');
      return false;
    } catch {
      setProxyStatus('offline');
      return false;
    }
  }, []);

  // Parse RSS item
  const parseRssItem = (item, searchKeyword, offering) => {
    const title = item.title?.[0] || '';
    const description = item.description?.[0] || '';
    const link = item.link?.[0] || '';
    const pubDate = item.pubDate?.[0] || '';
    const guid = item.guid?.[0]?._ || item.guid?.[0] || '';
    
    const cleanDescription = description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    
    const budgetMatch = cleanDescription.match(/Budget:\s*\$?([\d,]+(?:\.\d{2})?)/i);
    const hourlyMatch = cleanDescription.match(/Hourly Range:\s*\$?([\d.]+)-\$?([\d.]+)/i);
    
    let budget = 'Not specified';
    let isHourly = false;
    let budgetMin = 0;
    let budgetMax = 0;
    
    if (hourlyMatch) {
      isHourly = true;
      budgetMin = parseFloat(hourlyMatch[1]);
      budgetMax = parseFloat(hourlyMatch[2]);
      budget = `$${budgetMin}-$${budgetMax}/hr`;
    } else if (budgetMatch) {
      budget = `$${budgetMatch[1]}`;
      budgetMax = parseFloat(budgetMatch[1].replace(/,/g, ''));
    }
    
    const skillsMatch = cleanDescription.match(/Skills:\s*([^.]+)/i);
    const skills = skillsMatch ? skillsMatch[1].split(',').map(s => s.trim()).filter(s => s) : [];
    
    const countryMatch = cleanDescription.match(/Country:\s*([^.]+)/i);
    const country = countryMatch ? countryMatch[1].trim() : '';
    
    let matchScore = 60;
    const lowerTitle = title.toLowerCase();
    const lowerDesc = cleanDescription.toLowerCase();
    
    offering.keywords.forEach(keyword => {
      const keywordLower = keyword.toLowerCase();
      const regex = new RegExp(keywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      const titleMatches = (lowerTitle.match(regex) || []).length;
      const descMatches = (lowerDesc.match(regex) || []).length;
      matchScore += (titleMatches * 8) + (descMatches * 3);
    });
    
    if (cleanDescription.toLowerCase().includes('verified payment')) matchScore += 5;
    if (budgetMax > 5000) matchScore += 5;
    if (budgetMax > 10000) matchScore += 5;
    
    matchScore = Math.min(matchScore, 99);
    
    let estimatedHours = 20;
    if (budgetMax > 0 && !isHourly) {
      const avgRate = offering.defaultRate || 100;
      estimatedHours = Math.max(10, Math.floor(budgetMax / avgRate));
    } else if (isHourly) {
      estimatedHours = Math.floor(Math.random() * 60) + 20;
    }
    
    return {
      id: guid || `${link}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title,
      description: cleanDescription.substring(0, 800),
      link,
      postedDate: new Date(pubDate),
      category: offering.name,
      budget,
      budgetMin,
      budgetMax,
      isHourly,
      estimatedHours,
      skills,
      country,
      matchScore,
      searchKeyword
    };
  };

  // Fetch projects
  const fetchProjects = async () => {
    setLoading(true);
    
    const isProxyOnline = await checkProxyStatus();
    
    if (!isProxyOnline) {
      setProjects([{
        id: 'proxy-offline',
        title: '🔌 Proxy Server Offline',
        description: `The backend proxy server is not responding.

If you're the admin:
1. Make sure the backend is deployed on Render.com
2. Check that VITE_API_URL is set correctly in Vercel

Current API URL: ${API_URL}

Contact your team admin if this issue persists.`,
        link: 'https://www.upwork.com/nx/find-work/',
        postedDate: new Date(),
        category: 'System',
        budget: 'N/A',
        isHourly: false,
        estimatedHours: 0,
        matchScore: 0,
        isInstruction: true
      }]);
      setLoading(false);
      return;
    }
    
    try {
      const keywordSearches = offerings.flatMap(offering => 
        offering.keywords.slice(0, 3).map(keyword => ({
          keyword,
          offering
        }))
      );
      
      const allProjects = new Map();
      const keywords = [...new Set(keywordSearches.map(s => s.keyword))].slice(0, 10);
      
      try {
        const batchResponse = await fetch(`${API_URL}/api/upwork/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keywords })
        });
        
        if (batchResponse.ok) {
          const batchData = await batchResponse.json();
          
          if (batchData.success && batchData.results) {
            batchData.results.forEach(result => {
              if (result.data?.rss?.channel?.[0]?.item) {
                const items = result.data.rss.channel[0].item;
                const searchInfo = keywordSearches.find(s => s.keyword === result.keyword);
                
                if (searchInfo) {
                  items.forEach(item => {
                    const parsed = parseRssItem(item, result.keyword, searchInfo.offering);
                    if (parsed.link && !allProjects.has(parsed.link)) {
                      allProjects.set(parsed.link, parsed);
                    }
                  });
                }
              }
            });
          }
        }
      } catch (batchError) {
        console.warn('Batch fetch failed:', batchError);
        
        for (const search of keywordSearches.slice(0, 5)) {
          try {
            const response = await fetch(
              `${API_URL}/api/upwork/search?keyword=${encodeURIComponent(search.keyword)}`
            );
            
            if (response.ok) {
              const data = await response.json();
              
              if (data.success && data.data?.rss?.channel?.[0]?.item) {
                const items = data.data.rss.channel[0].item;
                items.forEach(item => {
                  const parsed = parseRssItem(item, search.keyword, search.offering);
                  if (parsed.link && !allProjects.has(parsed.link)) {
                    allProjects.set(parsed.link, parsed);
                  }
                });
              }
            }
          } catch (err) {
            console.error(`Error fetching ${search.keyword}:`, err);
          }
        }
      }
      
      const projectsArray = Array.from(allProjects.values());
      
      if (projectsArray.length === 0) {
        setProjects([{
          id: 'no-results',
          title: '📭 No Projects Found',
          description: `No projects matched your keywords. Try:

• Using broader search terms
• Adding more common keywords  
• Waiting a few minutes and refreshing

Current keywords: ${keywords.join(', ')}`,
          link: 'https://www.upwork.com/nx/find-work/',
          postedDate: new Date(),
          category: 'System',
          budget: 'N/A',
          isHourly: false,
          estimatedHours: 0,
          matchScore: 0,
          isInstruction: true
        }]);
      } else {
        setProjects(projectsArray);
        setLastRefresh(new Date());
      }
      
    } catch (error) {
      console.error('Error:', error);
      setProjects([{
        id: 'error-1',
        title: '❌ Error Fetching Projects',
        description: `Error: ${error.message}\n\nPlease try refreshing again.`,
        link: 'https://www.upwork.com/nx/find-work/',
        postedDate: new Date(),
        category: 'System',
        budget: 'N/A',
        isHourly: false,
        estimatedHours: 0,
        matchScore: 0,
        isInstruction: true
      }]);
    }
    
    setLoading(false);
  };

  // Generate proposal
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
            content: `Generate a compelling Upwork proposal. Be professional and specific.

PROJECT:
Title: ${project.title}
Description: ${project.description}
Skills: ${project.skills?.join(', ') || 'Not specified'}
Budget: ${project.budget}

YOUR OFFER:
Category: ${project.category}
Rate: $${rate}/hr
Hours: ${project.estimatedHours}
Total: $${estimatedCost.toLocaleString()}

REQUIREMENTS:
1. Hook showing you understand their problem
2. 2-3 relevant experiences
3. Clear approach
4. Timeline
5. Pricing
6. Call-to-action
7. Under 250 words
8. Professional tone
9. No generic phrases

Return ONLY valid JSON:
{"proposal": "text with \\n for line breaks", "keyPoints": ["point1", "point2", "point3"], "estimatedTimeline": "X weeks"}`
          }]
        })
      });

      const data = await response.json();
      const textContent = data.content?.find(item => item.type === 'text')?.text || '';
      
      let proposalData;
      try {
        proposalData = JSON.parse(textContent.replace(/```json\n?|\n?```/g, '').trim());
      } catch {
        proposalData = {
          proposal: textContent,
          keyPoints: ['Custom proposal generated'],
          estimatedTimeline: `${Math.ceil(project.estimatedHours / 40)} weeks`
        };
      }
      
      setProposals(prev => ({
        ...prev,
        [project.id]: {
          ...proposalData,
          rate,
          estimatedHours: project.estimatedHours,
          estimatedCost,
          generatedAt: new Date()
        }
      }));
      
      setShowRateInput(false);
      setCustomRate('');
    } catch (error) {
      console.error('Error:', error);
      setProposals(prev => ({
        ...prev,
        [project.id]: {
          proposal: `Error: ${error.message}\n\nPlease try again.`,
          keyPoints: [],
          rate,
          estimatedHours: project.estimatedHours,
          estimatedCost,
          generatedAt: new Date()
        }
      }));
    }
    
    setGeneratingProposal(false);
  };

  // Copy to clipboard
  const copyProposal = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  // Toggle save
  const toggleSaveProject = (project) => {
    setSavedProjects(prev => {
      const exists = prev.some(p => p.id === project.id);
      if (exists) {
        return prev.filter(p => p.id !== project.id);
      }
      return [...prev, { ...project, savedAt: new Date() }];
    });
  };

  // Category management
  const addOffering = () => {
    setOfferings([...offerings, {
      name: 'New Service',
      keywords: ['keyword1', 'keyword2'],
      defaultRate: 100
    }]);
    setEditingOffering(offerings.length);
  };

  const updateOffering = (index, field, value) => {
    const updated = [...offerings];
    if (field === 'keywords') {
      updated[index][field] = value.split(',').map(k => k.trim()).filter(k => k);
    } else {
      updated[index][field] = value;
    }
    setOfferings(updated);
  };

  const deleteOffering = (index) => {
    if (confirm('Delete this service category?')) {
      setOfferings(offerings.filter((_, i) => i !== index));
      setEditingOffering(null);
    }
  };

  // Initial load
  useEffect(() => {
    checkProxyStatus();
    fetchProjects();
    
    const statusInterval = setInterval(checkProxyStatus, 30000);
    const fetchInterval = setInterval(fetchProjects, 300000);
    
    return () => {
      clearInterval(statusInterval);
      clearInterval(fetchInterval);
    };
  }, []);

  // Filter and sort
  const filteredProjects = projects
    .filter(project => {
      if (filter === 'saved') return savedProjects.some(p => p.id === project.id);
      const matchesFilter = filter === 'all' || project.category === filter;
      const matchesSearch = !searchTerm || 
        project.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        project.description.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesFilter && matchesSearch;
    })
    .sort((a, b) => {
      if (a.isInstruction) return -1;
      if (b.isInstruction) return 1;
      if (sortBy === 'match') return b.matchScore - a.matchScore;
      if (sortBy === 'budget') return (b.budgetMax || 0) - (a.budgetMax || 0);
      return new Date(b.postedDate) - new Date(a.postedDate);
    });

  // Metrics
  const realProjects = projects.filter(p => !p.isInstruction);
  const totalProjects = realProjects.length;
  const avgMatchScore = totalProjects > 0 
    ? Math.round(realProjects.reduce((sum, p) => sum + p.matchScore, 0) / totalProjects)
    : 0;
  const totalPotentialValue = realProjects.reduce((sum, p) => {
    const offering = offerings.find(o => o.name === p.category);
    return sum + (p.estimatedHours * (offering?.defaultRate || 100));
  }, 0);

  const getTimeSincePosted = (date) => {
    const hours = Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60));
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return days === 1 ? 'Yesterday' : `${days}d ago`;
  };

  const getUrgencyColor = (date) => {
    const hours = Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60));
    if (hours < 6) return 'bg-emerald-500';
    if (hours < 24) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-slate-100">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-950/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold gradient-text">Upwork Tracker</h1>
              <p className="text-slate-400 text-sm mono">AI-Powered Project Intelligence</p>
            </div>
            
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                proxyStatus === 'online' ? 'bg-emerald-500/20 text-emerald-300' :
                proxyStatus === 'checking' ? 'bg-amber-500/20 text-amber-300' :
                'bg-rose-500/20 text-rose-300'
              }`}>
                {proxyStatus === 'online' ? <Wifi size={16} /> : 
                 proxyStatus === 'checking' ? <RefreshCw size={16} className="animate-spin" /> :
                 <WifiOff size={16} />}
                <span className="hidden sm:inline">{proxyStatus === 'online' ? 'Online' : proxyStatus === 'checking' ? 'Checking...' : 'Offline'}</span>
              </div>
              
              <button 
                onClick={() => setShowSettings(true)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium transition-all flex items-center gap-2"
              >
                <Settings size={18} />
                <span className="hidden sm:inline">Categories</span>
              </button>
              
              <button 
                onClick={fetchProjects}
                disabled={loading}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-medium transition-all disabled:opacity-50 flex items-center gap-2"
              >
                <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                {loading ? 'Scanning...' : 'Refresh'}
              </button>
            </div>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
            {[
              { icon: FileText, label: 'Projects', value: totalProjects, color: 'blue' },
              { icon: TrendingUp, label: 'Avg Match', value: `${avgMatchScore}%`, color: 'emerald' },
              { icon: DollarSign, label: 'Potential', value: `$${(totalPotentialValue / 1000).toFixed(0)}k`, color: 'purple' },
              { icon: Bookmark, label: 'Saved', value: savedProjects.length, color: 'amber' },
              { icon: Zap, label: 'Proposals', value: Object.keys(proposals).length, color: 'rose' },
            ].map((metric, i) => (
              <div key={i} className="glass rounded-xl p-3">
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 bg-${metric.color}-500/20 rounded-lg`}>
                    <metric.icon size={18} className={`text-${metric.color}-400`} />
                  </div>
                  <div>
                    <p className="text-slate-400 text-xs">{metric.label}</p>
                    <p className="text-lg font-bold">{metric.value}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="all">All Categories</option>
            <option value="saved">⭐ Saved</option>
            {offerings.map(o => <option key={o.name} value={o.name}>{o.name}</option>)}
          </select>
          
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="date">Newest</option>
            <option value="match">Best Match</option>
            <option value="budget">Budget</option>
          </select>
        </div>

        {lastRefresh && (
          <p className="text-slate-500 text-sm mb-4">Updated: {lastRefresh.toLocaleTimeString()}</p>
        )}

        {/* Projects */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredProjects.map((project, index) => {
            const isSaved = savedProjects.some(p => p.id === project.id);
            
            return (
              <div
                key={project.id}
                className={`glass project-card rounded-xl p-4 sm:p-5 ${project.isInstruction ? 'border-2 border-amber-500/50' : 'cursor-pointer'}`}
                onClick={() => !project.isInstruction && setSelectedProject(project)}
              >
                {project.isInstruction ? (
                  <div>
                    <h3 className="text-lg font-semibold mb-3 text-amber-400">{project.title}</h3>
                    <div className="text-slate-300 text-sm whitespace-pre-line leading-relaxed mb-4">
                      {project.description}
                    </div>
                    <a
                      href={project.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-medium transition-all text-sm"
                    >
                      Browse Upwork <ExternalLink size={16} />
                    </a>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 pr-2">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className={`w-2 h-2 rounded-full ${getUrgencyColor(project.postedDate)}`}></span>
                          <span className="text-xs mono text-slate-400">{getTimeSincePosted(project.postedDate)}</span>
                          <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 text-xs rounded-full">
                            {project.category}
                          </span>
                        </div>
                        <h3 className="text-base font-semibold mb-1 line-clamp-2">{project.title}</h3>
                        <p className="text-slate-400 text-sm line-clamp-2">{project.description}</p>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-sm">
                          {project.matchScore}%
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleSaveProject(project); }}
                          className={`p-1 rounded transition-colors ${isSaved ? 'text-amber-400' : 'text-slate-500 hover:text-amber-400'}`}
                        >
                          {isSaved ? <Bookmark size={16} /> : <Bookmark size={16} />}
                        </button>
                      </div>
                    </div>

                    {project.skills?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {project.skills.slice(0, 3).map((skill, i) => (
                          <span key={i} className="px-2 py-0.5 bg-slate-700/50 text-slate-300 text-xs rounded">
                            {skill}
                          </span>
                        ))}
                        {project.skills.length > 3 && (
                          <span className="text-slate-500 text-xs">+{project.skills.length - 3}</span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-4 mb-3 text-sm">
                      <span className="flex items-center gap-1">
                        <DollarSign size={14} className="text-slate-500" />
                        <span className="mono">{project.budget}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={14} className="text-slate-500" />
                        {project.estimatedHours}h
                      </span>
                    </div>

                    <div className="flex gap-2">
                      {proposals[project.id] ? (
                        <button
                          className="flex-1 px-3 py-2 bg-emerald-600/20 border border-emerald-600/30 text-emerald-300 rounded-lg text-sm font-medium flex items-center justify-center gap-1"
                          onClick={(e) => { e.stopPropagation(); setSelectedProject(project); }}
                        >
                          <CheckCircle size={14} /> View Proposal
                        </button>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedProject(project); setShowRateInput(true); }}
                          className="flex-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-all"
                        >
                          Generate Proposal
                        </button>
                      )}
                      <a
                        href={project.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-all"
                      >
                        <ExternalLink size={16} />
                      </a>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {filteredProjects.length === 0 && !loading && (
          <div className="text-center py-12">
            <AlertCircle size={40} className="mx-auto text-slate-600 mb-3" />
            <p className="text-slate-400">No projects found</p>
          </div>
        )}
      </div>

      {/* Project Modal */}
      {selectedProject && !selectedProject.isInstruction && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={() => { setSelectedProject(null); setShowRateInput(false); setCustomRate(''); }}
        >
          <div
            className="glass rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 animate-slide-in"
            onClick={(e) => e.stopPropagation()}
          >
            {showRateInput && !proposals[selectedProject.id] ? (
              <div>
                <div className="flex justify-between mb-4">
                  <h2 className="text-xl font-bold">Set Your Rate</h2>
                  <button onClick={() => { setSelectedProject(null); setShowRateInput(false); }} className="p-1 hover:bg-slate-700 rounded-lg">
                    <XCircle size={24} />
                  </button>
                </div>

                <p className="text-slate-400 mb-4 line-clamp-2">{selectedProject.title}</p>

                <div className="glass rounded-lg p-4 mb-4">
                  <label className="block text-sm text-slate-400 mb-2">Hourly Rate ($/hr)</label>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input
                        type="number"
                        value={customRate}
                        onChange={(e) => setCustomRate(e.target.value)}
                        placeholder={`${offerings.find(o => o.name === selectedProject.category)?.defaultRate || 100}`}
                        className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500 mono"
                        autoFocus
                      />
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-400">Total</div>
                      <div className="text-xl font-bold gradient-text">
                        ${((customRate || offerings.find(o => o.name === selectedProject.category)?.defaultRate || 100) * selectedProject.estimatedHours).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => generateProposal(selectedProject, customRate ? parseFloat(customRate) : null)}
                  disabled={generatingProposal}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Zap size={18} className={generatingProposal ? 'animate-pulse-slow' : ''} />
                  {generatingProposal ? 'Generating...' : 'Generate Proposal'}
                </button>
              </div>
            ) : (
              <>
                <div className="flex justify-between mb-4">
                  <div className="flex-1 pr-4">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`w-2 h-2 rounded-full ${getUrgencyColor(selectedProject.postedDate)}`}></span>
                      <span className="text-sm text-slate-400">{getTimeSincePosted(selectedProject.postedDate)}</span>
                      <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-sm rounded-full">
                        {selectedProject.matchScore}% Match
                      </span>
                    </div>
                    <h2 className="text-xl font-bold">{selectedProject.title}</h2>
                  </div>
                  <button onClick={() => setSelectedProject(null)} className="p-1 hover:bg-slate-700 rounded-lg h-fit">
                    <XCircle size={24} />
                  </button>
                </div>

                <p className="text-slate-300 text-sm mb-4">{selectedProject.description}</p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                  {[
                    { label: 'Budget', value: selectedProject.budget },
                    { label: 'Est. Hours', value: `${selectedProject.estimatedHours}h` },
                    { label: 'Type', value: selectedProject.isHourly ? 'Hourly' : 'Fixed' },
                    { label: 'Location', value: selectedProject.country || 'Global' },
                  ].map((item, i) => (
                    <div key={i} className="glass rounded-lg p-2">
                      <div className="text-slate-500 text-xs">{item.label}</div>
                      <div className="font-bold truncate">{item.value}</div>
                    </div>
                  ))}
                </div>

                {proposals[selectedProject.id] ? (
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <h3 className="text-sm font-semibold text-slate-400">PROPOSAL</h3>
                        <button
                          onClick={() => copyProposal(proposals[selectedProject.id].proposal, selectedProject.id)}
                          className="flex items-center gap-1 px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm"
                        >
                          {copiedId === selectedProject.id ? <CheckCircle size={14} /> : <Copy size={14} />}
                          {copiedId === selectedProject.id ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      <div className="glass rounded-lg p-4">
                        <p className="text-slate-200 text-sm whitespace-pre-wrap">{proposals[selectedProject.id].proposal}</p>
                      </div>
                    </div>

                    <div className="glass rounded-lg p-4">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-slate-400">Rate</span>
                        <span className="font-bold mono">${proposals[selectedProject.id].rate}/hr</span>
                      </div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-slate-400">Hours</span>
                        <span className="font-bold">{proposals[selectedProject.id].estimatedHours}h</span>
                      </div>
                      <div className="border-t border-slate-700 pt-2 mt-2 flex justify-between">
                        <span className="font-semibold">Total</span>
                        <span className="text-lg font-bold gradient-text">${proposals[selectedProject.id].estimatedCost.toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => { setShowRateInput(true); setProposals(prev => { const u = {...prev}; delete u[selectedProject.id]; return u; }); }}
                        className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium"
                      >
                        Regenerate
                      </button>
                      <a
                        href={selectedProject.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-medium text-center flex items-center justify-center gap-1"
                      >
                        Submit <ExternalLink size={16} />
                      </a>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowRateInput(true)}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-semibold flex items-center justify-center gap-2"
                  >
                    <Zap size={18} /> Generate Proposal
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={() => { setShowSettings(false); setEditingOffering(null); }}
        >
          <div
            className="glass rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 animate-slide-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between mb-4">
              <h2 className="text-xl font-bold">Service Categories</h2>
              <button onClick={() => { setShowSettings(false); setEditingOffering(null); }} className="p-1 hover:bg-slate-700 rounded-lg">
                <XCircle size={24} />
              </button>
            </div>

            <div className="space-y-3 mb-4">
              {offerings.map((offering, index) => (
                <div key={index} className="glass rounded-lg p-4">
                  {editingOffering === index ? (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={offering.name}
                        onChange={(e) => updateOffering(index, 'name', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500"
                        placeholder="Service name"
                      />
                      <textarea
                        value={offering.keywords.join(', ')}
                        onChange={(e) => updateOffering(index, 'keywords', e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500 text-sm"
                        placeholder="keyword1, keyword2, keyword3"
                      />
                      <input
                        type="number"
                        value={offering.defaultRate}
                        onChange={(e) => updateOffering(index, 'defaultRate', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500"
                        placeholder="Hourly rate"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => setEditingOffering(null)} className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-medium">Done</button>
                        <button onClick={() => deleteOffering(index)} className="px-3 py-2 bg-rose-600/20 text-rose-300 rounded-lg"><Trash2 size={18} /></button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold mb-1">{offering.name}</h3>
                        <div className="flex flex-wrap gap-1 mb-1">
                          {offering.keywords.slice(0, 4).map((k, i) => (
                            <span key={i} className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 text-xs rounded-full">{k}</span>
                          ))}
                          {offering.keywords.length > 4 && <span className="text-slate-500 text-xs">+{offering.keywords.length - 4}</span>}
                        </div>
                        <p className="text-slate-400 text-sm">${offering.defaultRate}/hr</p>
                      </div>
                      <button onClick={() => setEditingOffering(index)} className="p-1 hover:bg-slate-700 rounded-lg"><Edit size={18} /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button onClick={addOffering} className="w-full py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium flex items-center justify-center gap-2">
              <Plus size={18} /> Add Category
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
