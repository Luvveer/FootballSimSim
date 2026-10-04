import { ArrowRight, CircleDot, Swords, Users, LayoutGrid } from 'lucide-react'
import { LandingMatch } from './LandingMatch'
import './Landing.css'

const steps = [
  { icon: Users, title: 'Build your five', text: 'Pick a squad of 5 players from different years, anywhere between 2015 and 2024.' },
  { icon: LayoutGrid, title: 'Choose a formation', text: 'Players can be in or out of their preferred positions in any formation you like.' },
  { icon: Swords, title: 'Watch the duel', text: 'Face off against another squad and watch them duel over 90 seconds.' },
]

const facts = [
  { value: '5v5', label: 'Squads of five' },
  { value: '2015–2024', label: 'Ten editions' },
  { value: '180,000+', label: 'Player ratings' },
  { value: '90 sec', label: 'One full match' },
]

export function Landing({ onStart }: { onStart: () => void }) {
  return <div className="landing">
    <header className="lp-topbar">
      <a className="lp-brand" href="/" aria-label="FootballSimSim" onClick={event => { event.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}><span className="lp-brand-mark"><CircleDot size={22}/></span><span>FOOTBALL<span>SIM</span>SIM</span></a>
      <nav aria-label="Sections"><a href="#why">Why</a><a href="#how">How it works</a><a href="#next">What's next</a></nav>
      <button className="lp-button small" onClick={onStart}>Start Building</button>
    </header>

    <main id="top">
      <section className="lp-hero">
        <div className="lp-hero-copy">
          <p className="lp-eyebrow" aria-label="FootballSimSim">FOOTBALL<span className="sim-white">SIM</span>SIM</p>
          <h1>Settle all your <em>GOAT</em> football debates in <span>90 seconds</span></h1>
          <p className="lp-lede">Build a squad of five from any year between 2015 and 2024, then watch it face off against another squad.</p>
          <div className="lp-actions">
            <button className="lp-button" onClick={onStart}>Build Your Squad <ArrowRight size={18}/></button>
            <a className="lp-button ghost" href="#how">How it Works</a>
          </div>
        </div>
        <div className="lp-stage" aria-hidden="true"><LandingMatch/></div>
      </section>

      <section className="lp-facts" aria-label="At a glance">
        {facts.map(fact => <div key={fact.label}><strong>{fact.value}</strong><span>{fact.label}</span></div>)}
      </section>

      <section className="lp-section" id="why">
        <p className="lp-eyebrow">Inspiration</p>
        <h2>Every rage-fueled debate starts the same way</h2>
        <p className="lp-copy">We got inspired by every rage fueled debate whenever we watched a football game. We can't really pit 2 different players from different years against each other… or can we?</p>
      </section>

      <section className="lp-section" id="how">
        <p className="lp-eyebrow">What it does</p>
        <h2>Two squads. Any era. 90 seconds.</h2>
        <p className="lp-copy">A user can build a squad of 5 players from different years (specifically between 2015 and 2024) and face off against another squad. Players can be in or out of their preferred positions in any possible formation, and we get to see them duel over 90 seconds.</p>
        <ol className="lp-steps">
          {steps.map((step, index) => <li key={step.title}>
            <span className="lp-step-icon"><step.icon size={20}/></span>
            <small>0{index + 1}</small>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </li>)}
        </ol>
      </section>

      <section className="lp-section" id="next">
        <p className="lp-eyebrow">What's next for FootballSimSim</p>
        <h2>Beyond the pitch</h2>
        <p className="lp-copy">We could bridge this same concept to the NBA or the NFL. Seems to make sense to constantly compare players, because what would we do in the off season?</p>
        <div className="lp-chips"><span>NBA</span><span>NFL</span></div>
      </section>

      <section className="lp-cta">
        <h2>Ready to settle it?</h2>
        <p>Pick your five. Pick theirs. Let the match decide.</p>
        <button className="lp-button" onClick={onStart}>Build Your Squad <ArrowRight size={18}/></button>
      </section>
    </main>

    <footer className="lp-footer"><span>FOOTBALL<span>SIM</span>SIM</span><small>StormHacks 26'</small></footer>
  </div>
}
