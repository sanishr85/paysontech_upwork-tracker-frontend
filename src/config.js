// API Configuration
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Default service offerings - customize for your team
export const DEFAULT_OFFERINGS = [
  {
    name: 'AI Digital Marketing',
    keywords: ['AI marketing', 'digital marketing', 'marketing automation', 'AI campaign', 'social media AI'],
    defaultRate: 85
  },
  {
    name: 'Website Design & Development',
    keywords: ['website', 'web design', 'web development', 'react', 'nextjs', 'frontend', 'ecommerce'],
    defaultRate: 95
  },
  {
    name: 'AI Agents & Automation',
    keywords: ['AI agent', 'automation', 'chatbot', 'workflow automation', 'RPA', 'process automation'],
    defaultRate: 110
  },
  {
    name: 'Cybersecurity Support',
    keywords: ['cybersecurity', 'security audit', 'penetration testing', 'infosec', 'vulnerability'],
    defaultRate: 120
  },
  {
    name: 'IT Infrastructure',
    keywords: ['IT infrastructure', 'cloud migration', 'AWS', 'Azure', 'DevOps', 'server management'],
    defaultRate: 100
  }
];

// Parse Apify job data into our app format
export function parseApifyJob(job, matchedKeyword, offering) {
  let matchScore = 60;
  const title = (job.title || '').toLowerCase();
  const description = (job.description || '').toLowerCase();
  const skills = (job.skills || []).map(s => s.toLowerCase());
  
  if (offering) {
    offering.keywords.forEach(keyword => {
      const keywordLower = keyword.toLowerCase();
      if (title.includes(keywordLower)) matchScore += 10;
      if (description.includes(keywordLower)) matchScore += 5;
      if (skills.some(s => s.includes(keywordLower))) matchScore += 8;
    });
  }
  
  if (job.client?.paymentMethodVerified) matchScore += 5;
  if (job.client?.stats?.totalSpent > 10000) matchScore += 5;
  if (job.client?.stats?.feedbackRate >= 4.5) matchScore += 5;
  
  matchScore = Math.min(matchScore, 99);
  
  let budget = 'Not specified';
  let budgetMin = 0;
  let budgetMax = 0;
  let isHourly = false;
  
  if (job.budget) {
    if (job.budget.hourlyRate?.min || job.budget.hourlyRate?.max) {
      isHourly = true;
      budgetMin = job.budget.hourlyRate.min || 0;
      budgetMax = job.budget.hourlyRate.max || 0;
      budget = `$${budgetMin}-$${budgetMax}/hr`;
    } else if (job.budget.fixedBudget) {
      budgetMax = job.budget.fixedBudget;
      budget = `$${budgetMax.toLocaleString()}`;
    }
  }
  
  let estimatedHours = 20;
  if (budgetMax > 0 && !isHourly) {
    const avgRate = offering?.defaultRate || 100;
    estimatedHours = Math.max(10, Math.floor(budgetMax / avgRate));
  } else if (isHourly) {
    estimatedHours = Math.floor(Math.random() * 60) + 20;
  }
  
  return {
    id: job.uid || job.ciphertext || `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    title: job.title || 'Untitled Project',
    description: job.description || '',
    link: job.externalLink || `https://www.upwork.com/jobs/${job.ciphertext}`,
    postedDate: new Date(job.createdAt || Date.now()),
    category: offering?.name || 'General',
    budget,
    budgetMin,
    budgetMax,
    isHourly,
    estimatedHours,
    skills: job.skills || [],
    country: job.client?.countryCode || '',
    matchScore,
    searchKeyword: matchedKeyword,
    applicationCost: job.applicationCost,
    featured: job.featured,
    client: {
      name: job.client?.name,
      totalSpent: job.client?.stats?.totalSpent,
      hireRate: job.client?.stats?.hireRate,
      feedbackRate: job.client?.stats?.feedbackRate,
      paymentVerified: job.client?.paymentMethodVerified
    },
    experienceLevel: job.vendor?.experienceLevel
  };
}
