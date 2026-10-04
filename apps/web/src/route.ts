import { useCallback, useEffect, useState } from 'react'

// Two pages: the landing page at "/" and the squad builder / match flow at "/play". Anything else shows the landing page.
export type Route = '/' | '/play'

const readRoute = (): Route => window.location.pathname.replace(/\/+$/, '') === '/play' ? '/play' : '/'

export function useRoute(): [Route, (to: Route) => void] {
  const [route, setRoute] = useState<Route>(readRoute)
  useEffect(() => {
    const sync = () => setRoute(readRoute())
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])
  const navigate = useCallback((to: Route) => {
    if (readRoute() !== to || window.location.pathname !== to) window.history.pushState({}, '', to)
    setRoute(to)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [])
  return [route, navigate]
}

export const routeTitle: Record<Route, string> = {
  '/': 'FootballSimSim · Settle all your GOAT football debates in 90 seconds',
  '/play': 'FootballSimSim · Build Your Squad',
}
