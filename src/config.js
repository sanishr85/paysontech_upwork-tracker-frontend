// API Configuration
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Default service offerings with rate RANGES
export const DEFAULT_OFFERINGS = [
  {
    name: 'AI Digital Marketing',
    keywords: ['AI marketing', 'digital marketing', 'marketing automation', 'AI campaign', 'social media AI', 'social media'],
    rateMin: 65,
    rateMax: 95,
    skills: ['Social Media Marketing', 'AI Tools', 'Content Strategy', 'Analytics', 'Paid Advertising', 'SEO', 'Content Marketing']
  },
  {
    name: 'Website Design & Development',
    keywords: ['website', 'web design', 'web development', 'react', 'nextjs', 'frontend', 'ecommerce', 'wordpress'],
    rateMin: 75,
    rateMax: 120,
    skills: ['React', 'Next.js', 'WordPress', 'UI/UX Design', 'HTML/CSS', 'JavaScript', 'E-commerce', 'Web Development', 'PHP', 'Shopify']
  },
  {
    name: 'AI Agents & Automation',
    keywords: ['AI agent', 'automation', 'chatbot', 'workflow automation', 'RPA', 'process automation', 'GPT', 'LLM'],
    rateMin: 90,
    rateMax: 150,
    skills: ['Python', 'LangChain', 'OpenAI API', 'Automation', 'Chatbot Development', 'Integration', 'n8n', 'Zapier', 'Make']
  },
  {
    name: 'Cybersecurity Support',
    keywords: ['cybersecurity', 'security audit', 'penetration testing', 'infosec', 'vulnerability', 'security'],
    rateMin: 100,
    rateMax: 160,
    skills: ['Penetration Testing', 'Security Audits', 'Compliance', 'Network Security', 'SIEM', 'Vulnerability Assessment']
  },
  {
    name: 'IT Infrastructure',
    keywords: ['IT infrastructure', 'cloud migration', 'AWS', 'Azure', 'DevOps', 'server management', 'cloud'],
    rateMin: 80,
    rateMax: 130,
    skills: ['AWS', 'Azure', 'DevOps', 'Docker', 'Kubernetes', 'Linux', 'CI/CD', 'Terraform', 'Cloud Architecture']
  }
];

// Default proposal template
export const DEFAULT_PROPOSAL_TEMPLATE = `Hi,

I've carefully reviewed your project and I'm excited about the opportunity to help you achieve your goals.

**Why I'm the Right Fit:**
[Specific experience relevant to their project]

**My Approach:**
[Clear methodology and how I'll tackle their requirements]

**Timeline & Deliverables:**
[Realistic timeline with milestones]

**Investment:**
- Rate: $[RATE]/hr
- Estimated Hours: [HOURS]
- Total Estimate: $[TOTAL]

I'd love to discuss your project in more detail. When would be a good time for a quick call?

Best regards,
PaysonTech Team`;

// Parse Apify job data into our app format
export function parseApifyJob(job, matchedKeyword, offering) {
  let matchScore = 60;
  const title = (job.title || '').toLowerCase();
  const description = (job.description || '').toLowerCase();
  const jobSkills = (job.skills || []).map(s => s.toLowerCase());
  
  if (offering) {
    offering.keywords.forEach(keyword => {
      const keywordLower = keyword.toLowerCase();
      if (title.includes(keywordLower)) matchScore += 10;
      if (description.includes(keywordLower)) matchScore += 5;
      if (jobSkills.some(s => s.includes(keywordLower))) matchScore += 8;
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
    const avgRate = offering ? (offering.rateMin + offering.rateMax) / 2 : 100;
    estimatedHours = Math.max(10, Math.floor(budgetMax / avgRate));
  } else if (isHourly) {
    if (description.length > 1000) estimatedHours = 60;
    else if (description.length > 500) estimatedHours = 40;
    else estimatedHours = 20;
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
    country: job.client?.countryCode || job.client?.country || '',
    location: job.client?.location || job.client?.country || '',
    matchScore,
    searchKeyword: matchedKeyword,
    applicationCost: job.applicationCost,
    featured: job.featured,
    client: {
      name: job.client?.name,
      totalSpent: job.client?.stats?.totalSpent,
      hireRate: job.client?.stats?.hireRate,
      feedbackRate: job.client?.stats?.feedbackRate,
      paymentVerified: job.client?.paymentMethodVerified,
      country: job.client?.countryCode || job.client?.country || ''
    },
    experienceLevel: job.vendor?.experienceLevel,
    duration: job.engagement?.duration || null
  };
}
