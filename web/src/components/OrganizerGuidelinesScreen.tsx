'use client';

import Link from 'next/link';

import {
  ORGANIZER_GUIDELINE_INTRO,
  ORGANIZER_GUIDELINE_SECTIONS,
  ORGANIZER_GUIDELINE_UPDATED_AT,
} from '@/lib/organizerGuidelines';
import { mypageHref } from '@/lib/mypageNav';

export function OrganizerGuidelinesScreen() {
  return (
    <main className="page-main pt-4 md:pt-2">
      <Link
        href={mypageHref({ mode: 'organizer' })}
        className="text-sm font-extrabold text-[#12B8D0]"
      >
        ← マイページ
      </Link>
      <h1 className="mt-3 text-2xl font-extrabold tracking-tight">主催ガイドライン</h1>
      <p className="mt-1 text-xs font-bold text-[#8A9199]">
        更新日 {ORGANIZER_GUIDELINE_UPDATED_AT}
      </p>
      <p className="mt-3 text-sm font-bold leading-6 text-[#5B6B75]">
        {ORGANIZER_GUIDELINE_INTRO}
      </p>

      <div className="mt-5 space-y-4">
        {ORGANIZER_GUIDELINE_SECTIONS.map((section) => (
          <section key={section.id} className="card-shadow p-5">
            <h2 className="text-base font-extrabold tracking-tight">{section.title}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="mt-3 text-sm font-bold leading-6 text-[#5B6B75]">
                {paragraph}
              </p>
            ))}
            {section.bullets?.length ? (
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm font-bold leading-6 text-[#5B6B75]">
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>
    </main>
  );
}
