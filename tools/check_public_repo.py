"""Read-only checks of public files, documentation links, and release digests."""
from pathlib import Path
from urllib.parse import unquote
import hashlib, json, re, subprocess
root = Path(__file__).resolve().parents[1]
files = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard'], cwd=root, text=True).splitlines()
errors = []
for rel in files:
    p = root / rel
    if not p.is_file():
        errors.append('Missing repository file: ' + rel)
        continue
    if any(part in ('node_modules', '.wrangler', 'checkpoints', 'private') for part in p.relative_to(root).parts) or p.name in ('wrangler.toml', '.dev.vars', 'reveal-private.json', 'implementation-context.txt') or p.suffix in ('.sqlite', '.key', '.pem') or p.name.startswith('.env'):
        errors.append('Private or local-only file in public file list: ' + rel)
    if p.suffix == '.md':
        content = p.read_text()
        for target in re.findall(r'!?\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)', content):
            target = unquote(target.strip('<>')).split('#')[0]
            if not target or re.match(r'^[a-zA-Z]+:', target):
                continue
            if not (p.parent / target).exists():
                errors.append(rel + ': broken relative link: ' + target)
manifest = json.loads((root / 'release/manifest.json').read_text())
for entry in manifest['files']:
    p = root / 'release/site' / entry['path']
    if not p.is_file() or '0x' + hashlib.sha256(p.read_bytes()).hexdigest() != entry['sha256'] or p.stat().st_size != entry['bytes']:
        errors.append('Release digest or length mismatch: ' + entry['path'])
if errors:
    raise SystemExit('\n'.join(errors))
print(f'Public repository checks passed: {len(files)} files; relative links and {len(manifest["files"])} release digests valid.')
print('This is a file/structure check; it does not replace a credential scan or live mainnet acceptance.')
