export interface Link {
  name: string
  url: string
  icon: string
}

export const links: Link[] = [
  { name: 'GitHub', url: 'https://github.com', icon: 'i-lucide-github' },
  { name: 'Blog', url: 'https://blog.example.com', icon: 'i-lucide-book-open' },
  { name: 'Email', url: 'mailto:hello@example.com', icon: 'i-lucide-mail' },
]
