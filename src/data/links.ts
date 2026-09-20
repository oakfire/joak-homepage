export interface Link {
  name: string
  url: string
  icon: string
}

export const links: Link[] = [
  { name: 'Wiki', url: 'https://wiki.joak.org', icon: 'i-lucide-file-pen-line' },
  { name: 'GitHub', url: 'https://github.com/oakfire', icon: 'i-lucide-github' },
  { name: 'Blog', url: 'https://blog.joak.org', icon: 'i-lucide-book-open' },
  { name: 'Blog2', url: 'https://wp.joak.org', icon: 'i-lucide-book-open' },
  { name: 'Blog3', url: 'https://vali.joak.org', icon: 'i-lucide-book-open' },
  { name: 'Email', url: 'mailto:oakwatcher@gmail.com', icon: 'i-lucide-mail' },
  { name: 'Photos', url: 'https://img.joak.org', icon: 'i-lucide-images' },
]
