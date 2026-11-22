import { Activity, CalendarDays, HeartPulse } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { HEALTH_GROUPS, healthImpact } from '../lib/healthImpact';
import { round } from '../lib/format';
import { UNIT } from '../lib/config';
import { BandChip, SrcTag } from './ui';

export function HealthImpact({ open, onOpenChange, profile, onProfileChange, reading, place, when }) {
    const impact = healthImpact(reading?.v, profile);
    return <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="health-impact">
        <DialogHeader>
          <DialogTitle>PM2.5 &amp; your health</DialogTitle>
          <DialogDescription>{place} · {when}</DialogDescription>
        </DialogHeader>
        <div className="health-groups" role="group" aria-label="Health guidance for">
          {Object.entries(HEALTH_GROUPS).map(([key, group]) => <Button key={key} variant="outline" size="sm" aria-pressed={profile === key} onClick={() => onProfileChange(key)}>{group.label}</Button>)}
        </div>
        {!impact ? <p className="small">No PM2.5 reading is available for this place and hour. Choose another hour or place to see health guidance.</p> : <>
          <div className="health-reading">
            <div><strong className="num">{round(reading.v)}</strong> <span>{UNIT} · PM2.5</span></div>
            <BandChip band={impact.band}/>
            <SrcTag src={reading.src}/>
          </div>
          <section className="health-section">
            <h3><Activity/> Short-term effects</h3>
            <p className="small">{impact.shortContext}</p>
            <p className="small">{impact.group.short}</p>
          </section>
          <section className="health-section">
            <h3><CalendarDays/> Long-term risks</h3>
            <p className="small">{impact.group.long}</p>
            <p className="xs">These risks relate to prolonged exposure, not one hour or a single reading. A concentration does not mean someone will develop a disease.</p>
          </section>
          <section className="health-section health-recommendation">
            <h3><HeartPulse/> What to do now</h3>
            <p className="small"><strong>{impact.recommendation}</strong></p>
            <p className="small">{impact.precaution}</p>
          </section>
        </>}
        <p className="xs">Categories follow the EEA PM2.5 index. General guidance, not a diagnosis or a substitute for medical advice.</p>
      </DialogContent>
    </Dialog>;
}