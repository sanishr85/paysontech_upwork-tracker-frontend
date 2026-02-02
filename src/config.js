// API Configuration
// In production, this will use the environment variable set in Vercel
// In development, it falls back to localhost

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
