#!/usr/bin/env python3
"""Import official descriptions from scraper output without changing session identities."""
import argparse
import json
import re
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent.parent


class SessionHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.parts = {'title': [], 'description': []}
        self.counts = {'title': 0, 'description': 0}
        self.active = None
        self.suppressed = 0

    def handle_starttag(self, tag, attrs):
        classes = dict(attrs).get('class', '').split()
        field = next((name for name in self.parts if f'sz-session__{name}' in classes), None)
        if field:
            if self.active:
                raise ValueError('Nested Sessionize fields')
            self.active = field
            self.counts[field] += 1
        if tag in ('script', 'style'):
            self.suppressed += 1
        if self.active and tag in ('br', 'p', 'div', 'li'):
            self.parts[self.active].append('\n')
        if tag not in ('area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'):
            self.stack.append((tag, field))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if self.stack and self.stack[-1][0] == tag:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.suppressed = max(0, self.suppressed - 1)
        if self.active and tag in ('p', 'div', 'li'):
            self.parts[self.active].append('\n')
        if self.stack and self.stack[-1][0] == tag:
            _, field = self.stack.pop()
            if field:
                self.active = None

    def handle_data(self, data):
        if self.active and not self.suppressed:
            self.parts[self.active].append(data)

    def text(self, field):
        text = ''.join(self.parts[field]).replace('\r\n', '\n').replace('\r', '\n')
        lines = [re.sub(r'[^\S\n]+', ' ', line).strip() for line in text.split('\n')]
        return re.sub(r'\n{3,}', '\n\n', '\n'.join(lines)).strip()


def normalize(value):
    return ' '.join(value.split()).casefold()


def import_descriptions(catalog, download):
    if download.get('eventId') != catalog['event']['id']:
        raise ValueError('Download belongs to another event')
    sessions = download['sessions']
    by_id = {s['id']: s for s in sessions}
    if len(by_id) != len(sessions) or set(by_id) != {s['id'] for s in catalog['sessions']}:
        raise ValueError('Download must contain exactly one result per catalog session')
    updates = []
    for session in catalog['sessions']:
        result = by_id[session['id']]
        url = urlparse(result['sourceUrl'])
        if (url.scheme, url.netloc, url.path) != ('https', 'sessionize.com', '/api/v2/cdpvhngf/session') or parse_qs(url.query).get('id') != [session['id']]:
            raise ValueError(f"Unexpected source for {session['id']}")
        datetime.fromisoformat(result['retrievedAt'].replace('Z', '+00:00'))
        parser = SessionHTML()
        parser.feed(result['contentHtml'])
        if parser.counts != {'title': 1, 'description': 1} or not parser.text('description'):
            raise ValueError(f"Missing/ambiguous title or description for {session['id']}")
        if normalize(parser.text('title')) != normalize(session['title']):
            raise ValueError(f"Title mismatch for {session['id']}; review before importing")
        updates.append((session, result, parser.text('description')))
    # Validate every record before modifying the catalog.
    for session, result, text in updates:
        session['summary'] = {
            'text': text, 'language': 'und', 'basis': 'official-sessionize-abstract',
            'sourceUrl': result['sourceUrl'], 'retrievedAt': result['retrievedAt'],
        }
        if result['sourceUrl'] not in session['sources']:
            session['sources'].append(result['sourceUrl'])
    catalog['event']['abstractSnapshot'] = max(r['retrievedAt'] for r in sessions)[:10]
    obsolete = ('Tutte le sintesi sono redatte in italiano;',)
    catalog['event']['notes'] = [n for n in catalog['event']['notes'] if not n.startswith(obsolete)]
    note = 'Gli abstract ufficiali sono importati da Sessionize nella lingua originale, senza traduzione.'
    if note not in catalog['event']['notes']:
        catalog['event']['notes'].append(note)
    return len(updates)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=ROOT / '.sessionize-downloads/sessions.json')
    parser.add_argument('--catalog', type=Path, default=ROOT / 'src/data/catalog.json')
    args = parser.parse_args()
    catalog = json.loads(args.catalog.read_text(encoding='utf-8'))
    count = import_descriptions(catalog, json.loads(args.input.read_text(encoding='utf-8')))
    temporary = args.catalog.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(args.catalog)
    print(f'Imported {count} official abstracts; IDs, schedules and personal data unchanged.')


if __name__ == '__main__':
    main()
