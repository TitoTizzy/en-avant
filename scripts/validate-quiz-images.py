"""Contrôle du manifeste, des fichiers et de chaque texte contre le PDF source."""
from pathlib import Path
from collections import Counter
import hashlib
import json
import re
import unicodedata
from PIL import Image
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]

def normalize(s):
    s = unicodedata.normalize('NFC', s)
    s = re.sub(r'(\w)\s*-\s*\n\s*([a-zà-ÿ])', r'\1\2', s)
    return re.sub(r'\s+', ' ', s).strip()

def main():
    pdf = ROOT/'docs/livre-blanc.pdf'
    pages = [normalize(p.extract_text()) for p in PdfReader(pdf).pages]
    manifest = json.loads((ROOT/'pictures/quiz/manifest.json').read_text(encoding='utf-8'))
    assert isinstance(manifest, list) and len(manifest) == 40
    assert Counter(x['categorie'] for x in manifest) == {'chantier':20,'chiffre':10,'carte':5,'frise':5}
    assert {x['chantier'] for x in manifest if x['categorie']=='chantier'} == set(range(1,21))
    ids, expected, report = set(), set(), []
    required={'id','fichier','fichier_mobile','categorie','chantier','titre','legende','texte_alternatif','faits','source','elements_visibles'}
    for item in manifest:
        assert required <= item.keys()
        ident=item['id']
        assert ident not in ids; ids.add(ident)
        assert re.fullmatch(r'quiz-(chantier|chiffre|carte|frise)-\d{2}-[a-z0-9-]+',ident)
        assert item['chantier'] is None or type(item['chantier']) is int and 1<=item['chantier']<=20
        assert item['fichier']==f'pictures/quiz/{ident}.webp'
        assert item['fichier_mobile']==f'pictures/quiz/{ident}-800.webp'
        assert all(isinstance(item[k],str) and item[k].strip() for k in ['titre','legende','texte_alternatif','source'])
        source_pages=list(map(int,re.search(r'PDF ([\d, ]+)',item['source']).group(1).strip().split(', ')))
        evidence=[]
        for field in ['elements_visibles','faits']:
            assert isinstance(item[field],list) and item[field]
            for phrase in item[field]:
                matches=[p for p in source_pages if normalize(phrase) in pages[p-1]]
                assert matches, f'{ident} : texte non sourcé : {phrase}'
                evidence.append({'champ':field,'texte':phrase,'pages_pdf':matches})
        sizes={}
        for key,dimensions in [('fichier',(1200,675)),('fichier_mobile',(800,450))]:
            name=item[key]; expected.add(name)
            path=ROOT/name
            with Image.open(path) as image:
                assert image.format=='WEBP' and image.size==dimensions
                image.load()
            sizes[key]=path.stat().st_size
            assert sizes[key]<=150000
        report.append({'id':ident,'octets':sizes,'verification_source':evidence})
    actual={p.relative_to(ROOT).as_posix() for p in (ROOT/'pictures/quiz').glob('*.webp')}
    assert actual==expected, f'Fichiers absents ou orphelins : {actual ^ expected}'
    result={'source':'docs/livre-blanc.pdf','sha256':hashlib.sha256(pdf.read_bytes()).hexdigest(),
            'images':40,'variantes':80,'faits_non_verifies':[],
            'normalisation':'Unicode NFC, espaces et césures typographiques en fin de ligne ; casse, chiffres et ponctuation conservés.',
            'limite_cartes':'Cartogrammes schématiques de regroupement, sans frontières, échelle ni positions géographiques exactes. Le PDF ne fournit pas de fond cartographique.',
            'resultats':report}
    (ROOT/'pictures/quiz/verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('OK : 40 fiches, 80 WebP, dimensions et poids conformes ; chaque texte et fait vérifié aux pages citées.')

if __name__=='__main__': main()
