export interface Link {
  name: string
  url: string
  icon: string
}

export const links: Link[] = [
  { name: 'GitHub', url: 'https://github.com', icon: 'GH' },
  { name: 'Blog', url: 'https://blog.example.com', icon: '📝' },
  { name: 'Email', url: 'mailto:hello@example.com', icon: '✉' },
]
