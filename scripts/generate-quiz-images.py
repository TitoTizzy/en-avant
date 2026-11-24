"""Assets graphiques déterministes ; seule source documentaire : docs/livre-blanc.pdf.
Exécution : python scripts/generate-quiz-images.py (Pillow, pypdf).
"""
from pathlib import Path
import hashlib
import json
import math
import re
import unicodedata
from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'pictures/quiz'
PDF = ROOT / 'docs/livre-blanc.pdf'
SCALE = 2
NAVY, ORANGE, DARK, WHITE = '#0e1726', '#ff6a2a', '#e0551f', '#ffffff'
FONT = Path('C:/Windows/Fonts/segoeui.ttf')
BOLD = Path('C:/Windows/Fonts/segoeuib.ttf')

def norm(s):
    s = unicodedata.normalize('NFC', s)
    s = re.sub(r'(\w)\s*-\s*\n\s*([a-zà-ÿ])', r'\1\2', s)
    return re.sub(r'\s+', ' ', s).strip()

pages = [norm(p.extract_text()) for p in PdfReader(PDF).pages]

def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub('[^a-z0-9]+', '-', s).strip('-')

def font(n, bold=False):
    return ImageFont.truetype(str(BOLD if bold else FONT), round(n*SCALE))

def canvas():
    im = Image.new('RGB', (1200*SCALE, 675*SCALE), NAVY)
    return im, ImageDraw.Draw(im)

def line(d, pts, fill=WHITE, w=8):
    d.line([(int(x*SCALE), int(y*SCALE)) for x,y in pts], fill=fill, width=int(w*SCALE), joint='curve')

def box(d, xy, fill=None, outline=WHITE, width=5, radius=18):
    d.rounded_rectangle(tuple(int(v*SCALE) for v in xy), radius=radius*SCALE, fill=fill, outline=outline, width=width*SCALE)

def ellipse(d, xy, fill=None, outline=WHITE, width=5):
    d.ellipse(tuple(int(v*SCALE) for v in xy), fill=fill, outline=outline, width=width*SCALE)

def poly(d, pts, fill=ORANGE, outline=None):
    d.polygon([(int(x*SCALE),int(y*SCALE)) for x,y in pts], fill=fill, outline=outline)

def text(d, xy, s, size=40, fill=WHITE, bold=False):
    d.text((int(xy[0]*SCALE),int(xy[1]*SCALE)), s, font=font(size,bold), fill=fill)

def wrapped(d, s, xy, width, size=48, maxlines=4, fill=WHITE):
    # Fit whole words without truncation or fabricated abbreviations.
    while True:
        rows, row = [], ''
        for word in s.split():
            test = (row+' '+word).strip()
            if d.textlength(test,font=font(size,True)) > width*SCALE and row:
                rows.append(row); row=word
            else: row=test
        rows.append(row)
        if len(rows)<=maxlines and all(d.textlength(r,font=font(size,True))<=width*SCALE for r in rows): break
        size-=1
        if size<20: raise ValueError('Titre trop long : '+s)
    for i,r in enumerate(rows): text(d,(xy[0],xy[1]+i*size*1.23),r,size,fill,bold=True)
    return len(rows)*size*1.23

def base(d):
    box(d,(42,42,1158,633),outline=DARK,width=1,radius=25)
    line(d,[(76,88),(152,88)],ORANGE,7)
    # Motif purement décoratif : aucune donnée ni texte supplémentaire.
    for x,y,r in [(1100,110,35),(1060,565,58)]:
        ellipse(d,(x-r,y-r,x+r,y+r),outline=DARK,width=2)

def arrow(d,x,y,w=60):
    line(d,[(x,y),(x+w,y)],ORANGE,5)
    line(d,[(x+w-13,y-13),(x+w,y),(x+w-13,y+13)],ORANGE,5)

def pictogram(d,k,cx=900,cy=340):
    # Pictogrammes abstraits, jamais des portraits ni des photographies.
    def L(p,c=WHITE,w=7): line(d,[(cx+x,cy+y) for x,y in p],c,w)
    def B(p,fill=None,c=WHITE): box(d,tuple(v+(cx if i%2==0 else cy) for i,v in enumerate(p)),fill,c)
    def E(p,fill=None,c=WHITE): ellipse(d,tuple(v+(cx if i%2==0 else cy) for i,v in enumerate(p)),fill,c)
    if k==1:
        L([(-100,-110),(0,-150),(100,-110),(85,30),(0,125),(-85,30),(-100,-110)],ORANGE,10)
        L([(-45,-15),(-10,22),(54,-53)],WHITE,12)
    elif k==2:
        B((-110,-70,110,100)); L([(-45,-70),(-45,-110),(45,-110),(45,-70)],ORANGE)
        L([(0,-25),(0,55)],ORANGE,18); L([(-40,15),(40,15)],ORANGE,18)
    elif k in (3,17):
        for i,h in enumerate([55,100,160]): B((-110+i*75,110-h,-60+i*75,110),ORANGE,ORANGE)
        L([(-105,-10),(-25,-70),(45,-95),(110,-150)],WHITE,8)
        L([(65,-150),(110,-150),(110,-105)],WHITE,8)
        if k==17: B((-138,120,138,140),WHITE,WHITE)
    elif k==4:
        L([(0,-80),(-110,-110),(-110,85),(0,115),(110,85),(110,-110),(0,-80),(0,115)],ORANGE,8)
        for y in [-45,-5,35]:
            L([(-85,y),(-25,y+15)]); L([(25,y+15),(85,y)])
    elif k in (5,14):
        E((-110,-110,110,110),c=ORANGE)
        E((-55,-110,55,110)); L([(-110,0),(110,0)]); L([(-90,-60),(90,-60)]); L([(-90,60),(90,60)])
        if k==5:
            for x,y in [(-135,-110),(125,100),(-135,100)]:
                E((x-13,y-13,x+13,y+13),WHITE,WHITE)
                L([(x,y),(0,0)],ORANGE,3)
        else: L([(-135,135),(135,135)],ORANGE)
    elif k==6:
        B((-100,-120,100,125)); L([(0,-75),(0,20)],ORANGE,23); L([(-47,-28),(47,-28)],ORANGE,23)
        L([(-75,75),(-35,75),(-15,50),(5,95),(30,65),(75,65)])
    elif k==7:
        E((-125,-110,-35,-20),c=ORANGE); E((35,-110,125,-20))
        L([(-80,-20),(-80,110)],ORANGE,10); L([(80,-20),(80,110)],WHITE,10)
        L([(-30,20),(30,20)],ORANGE,9); L([(-30,55),(30,55)],ORANGE,9)
    elif k in (8,15):
        L([(0,115),(0,-40)],ORANGE,9)
        for sign,y in [(-1,20),(1,-15),(-1,-50),(1,-85)]:
            L([(0,y+30),(sign*70,y),(sign*85,y-55),(sign*25,y-40),(0,y+30)],WHITE,6)
        L([(-120,125),(120,125)],ORANGE,8)
        if k==15:
            L([(-130,95),(-130,30)]); E((-150,0,-110,40),ORANGE,ORANGE)
    elif k==9:
        L([(-80,85),(-80,-80),(70,-120),(70,45)],ORANGE,9)
        E((-125,55,-60,105),ORANGE,ORANGE); E((25,20,90,70),ORANGE,ORANGE)
        L([(-25,-50),(25,-65)],WHITE,5)
    elif k==10:
        E((-25,-130,25,-80),ORANGE,ORANGE)
        L([(-65,-30),(0,-55),(70,-20)],WHITE,10)
        L([(0,-55),(0,35),(-70,110)],ORANGE,10); L([(0,35),(80,95)],WHITE,10)
        E((85,40,140,95),c=ORANGE)
    elif k==11:
        L([(0,-135),(0,105),(-85,105),(85,105)],ORANGE,9)
        L([(-115,-70),(115,-70)]); L([(-85,-70),(-115,15),(-55,15),(-85,-70)])
        L([(85,-70),(55,15),(115,15),(85,-70)])
    elif k==12:
        ellipse(d,(cx+35,cy-130,cx+105,cy-60),ORANGE,ORANGE)
        L([(-120,70),(120,70)],ORANGE)
        L([(-70,65),(-55,-40),(-35,-90)],WHITE,9)
        L([(-35,-90),(-105,-100),(-120,-70)],ORANGE)
        L([(-35,-90),(45,-95),(70,-60)],ORANGE)
        L([(-120,110),(-60,95),(0,110),(60,95),(120,110)])
    elif k==13:
        L([(-140,105),(-140,-10),(-90,-10),(-90,105)],ORANGE,9)
        L([(90,105),(90,-10),(140,-10),(140,105)],ORANGE,9)
        L([(-140,30),(140,30)],WHITE,12); L([(-90,30),(0,-65),(90,30)],ORANGE,8)
    elif k==16:
        B((-95,-120,70,120)); E((0,-20,110,90),c=ORANGE)
        L([(95,75),(140,120)],ORANGE,12)
        for y in [-75,-35,5]: L([(-65,y),(-15,y)],WHITE,5)
    elif k==18:
        poly(d,[(cx+15,cy-150),(cx-90,cy+20),(cx-5,cy+20),(cx-35,cy+150),(cx+105,cy-40),(cx+15,cy-40)])
    elif k==19:
        L([(-100,100),(70,-120)],ORANGE,14)
        L([(-100,-105),(-20,-130),(70,-120),(130,-75)],WHITE,14)
        L([(-70,120),(10,70),(90,120),(-70,120)],WHITE,7)
    elif k==20:
        for x,y in [(0,-85),(-95,85),(95,85)]:
            B((x-40,y-30,x+40,y+30),ORANGE,ORANGE)
        L([(0,-55),(0,15),(-95,55)]); L([(0,15),(95,55)])

manifest=[]
def save(category,num,title,visible,pgs,facts,caption,alt,chantier=None,custom_slug=None,draw=None):
    for s in visible+facts:
        if not any(norm(s) in pages[p-1] for p in pgs):
            raise ValueError(f'Non vérifié : {s!r}, pages {pgs}')
    ident=f'quiz-{category}-{num:02d}-{custom_slug or slug(title)}'
    im,d=canvas(); base(d); draw(d)
    for width,height,suffix in [(1200,675,''),(800,450,'-800')]:
        path=OUT/f'{ident}{suffix}.webp'
        im.resize((width,height),Image.Resampling.LANCZOS).save(path,'WEBP',quality=80,method=6)
        if width==1200 and path.stat().st_size>150000: raise ValueError('Poids excessif '+str(path))
    manifest.append(dict(id=ident,fichier=f'pictures/quiz/{ident}.webp',fichier_mobile=f'pictures/quiz/{ident}-800.webp',categorie=category,chantier=chantier,titre=title,legende=caption,texte_alternatif=alt,faits=facts,source='docs/livre-blanc.pdf, page(s) PDF '+', '.join(map(str,pgs))+' (pagination imprimée identique).',elements_visibles=visible))

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    # Intitulés extraits des pages d'ouverture, espaces et retours à la ligne normalisés.
    starts=[38,52,56,65,79,86,94,102,109,114,119,129,137,146,158,165,172,178,185,193]
    for n,p in enumerate(starts,1):
        heading=re.sub(r'^.*?PAGE \| '+str(p)+r'\s*','',pages[p-1])
        title=re.sub(r'^\d+\s*[-–]\s*','',heading).strip()
        visible=[str(n),title]
        def render(d,n=n,title=title):
            text(d,(76,120),str(n),88,ORANGE,True)
            wrapped(d,title,(76,285),600,48,4)
            pictogram(d,n)
        save('chantier',n,title,visible,[p],[heading],
             f'Illustration symbolique du chantier {n} : {title}. Le pictogramme exprime son thème sans représenter de personne ou de lieu réel.',
             f'Numéro {n}, intitulé « {title} » et pictogramme abstrait sur fond bleu nuit.',n,draw=render)

    numbers=[
        ('2054','économie émergente',20,3,'En Avant propose dans son programme de repousser l’échéance à l’année 2054.'),
        ('20%','personnes vivant en dessous du seuil de pauvreté',61,3,'Réduire de 20% le nombre de personnes vivant en dessous du seuil de pauvreté suivant le normes dévaluation des nations-unies.'),
        ('10%','l’inflation',61,3,'Ramener l’inflation à une moyenne de 10%'),
        ('100%','couverture sanitaire',89,6,'Viser Une couverture sanitaire à 100%'),
        ('15 %','budget santé',92,6,'Augmenter progressivement le pourcentage du budget santé à 15 % du budget National.'),
        ('1,5%','couverture forestière',106,8,'Faire passer la couverture forestière du pays de 1,5% à 5%'),
        ('5%','couverture forestière',106,8,'Faire passer la couverture forestière du pays de 1,5% à 5%'),
        ('50%','revenu per capita rural',163,15,'Augmenter de 50% le revenu per capita rural.'),
        ('60%','autosuffisance',163,15,'Réduire de 25% la dépendance alimentaire pour atteindre un taux d’autosuffisance de 60% à la fin du mandat présidentiel.'),
        ('100%','exportations de produits agricoles',163,15,'Augmenter les exportations de produits agricoles de 100% sur les 5 prochaines années.'),
    ]
    for n,(value,label,p,c,excerpt) in enumerate(numbers,1):
        # Conserver la phrase complète telle qu'extraite, y compris ses coupures typographiques.
        page=pages[p-1]
        if excerpt.endswith('-'):
            start=page.index(norm(excerpt)); end=page.find('.',start)
            excerpt=page[start:end+1]
        qualifier={1:'l’année',2:'Réduire de',3:'Ramener',4:'Viser',5:'Augmenter',6:'de',7:'à',8:'Augmenter de',9:'atteindre un taux',10:'Augmenter'}[n]
        def render(d,value=value,label=label,c=c,n=n,qualifier=qualifier):
            text(d,(82,115),qualifier,29,WHITE)
            text(d,(76,145),value,138,ORANGE,True)
            wrapped(d,label,(82,345),600,43,3)
            # Motif non quantitatif, sans axe ni proportion implicite.
            if n in (1,2,3):
                ellipse(d,(820,220,1040,440),outline=ORANGE,width=9)
                ellipse(d,(865,265,995,395),outline=WHITE,width=5)
                ellipse(d,(915,315,945,345),fill=ORANGE,outline=ORANGE)
            else: pictogram(d,c,930,340)
        save('chiffre',n,f'{value} — {label}',[qualifier,value,label],[p],[excerpt],
             'Mise en valeur d’un objectif du Livre blanc. '+excerpt,
             f'Valeur {value}, extrait « {label} », accompagnés d’un pictogramme symbolique ; objectif du programme, pas résultat acquis.',c,custom_slug=slug(label)+('-depart' if n==6 else ''),draw=render)

    # Cartogrammes de regroupement : aucune frontière géographique inventée.
    groups=[('La région Nord',['Nord-Ouest','Nord','Nord Est','Artibonite','Centre']),
            ('La région Sud',['Nippes','Sud','Grande Anse','Sud Est']),
            ('La zone métropolitaine',['Ouest']),
            ('Artibonite',['Artibonite']),('Centre',['Centre'])]
    regions=[['Nord-Ouest','Nord','Nord Est','Artibonite','Centre'],['Nippes','Sud','Grande Anse','Sud Est'],['Ouest']]
    for n,(title,active) in enumerate(groups,1):
        def render(d,title=title,active=active):
            wrapped(d,title,(76,120),1050,46,2)
            # Trois blocs proportionnés pour la lisibilité, sans métrique spatiale.
            positions={'Nord-Ouest':(570,230),'Nord':(750,230),'Nord Est':(930,230),
                       'Artibonite':(570,325),'Centre':(750,325),'Ouest':(660,420),
                       'Grande Anse':(90,400),'Nippes':(270,400),'Sud':(270,495),'Sud Est':(480,495)}
            for region in regions:
                for name in region:
                    xx,yy=positions[name]
                    selected=name in active
                    box(d,(xx,yy,xx+170,yy+82),ORANGE if selected else NAVY,ORANGE if selected else WHITE,2,12)
                    wrapped(d,name,(xx+10,yy+9),150,29,2,fill=NAVY if selected else WHITE)
        membership='La région Nord - Le groupement des 5 départements du Nord-Ouest, du Nord, du Nord Est, de l’Artibonite et du Centre, articulés autour de la plaine de l’Artibonite.' if n in (1,4,5) else ('La région Sud qui regroupe les quatre départements des Nippes, du Sud, de la Grande Anse et du Sud Est.' if n==2 else 'La zone métropolitaine plus précisément le département de l’Ouest')
        save('carte',n,title,[title]+[x for r in regions for x in r],[105],[membership],
             f'Cartogramme schématique d’Haïti : {title} en orange dans les regroupements décrits à la page 105. Les cases ne représentent ni frontières administratives, ni superficies, ni positions géographiques exactes.',
             f'Carte en cases des départements cités ; {", ".join(active)} en orange, les autres cases en bleu nuit. Regroupement schématique sans précision géographique.',8,draw=render)

    flows=[
        ('ENERGIE',['A court terme','A moyen terme et long terme'],[178,182],18,
         ['A court terme :','A moyen terme et long terme, l’EDH devra entreprendre les actions suivantes :']),
        ('JUSTICE',['court terme','long terme'],[119,123,125],11,
         ['des actions à court terme','un effort parallèle de renforcement des capacités institutionnelles sur le long terme.']),
        ('couverture forestière',['1,5%','5%'],[106],8,
         ['Faire passer la couverture forestière du pays de 1,5% à 5%']),
        ('l’accès',['12.5%','25%'],[182],18,
         ['de 100% l’accès, soit de 12.5% à 25%.']),
        ('Santé',['premiers soins de secours','transfert des patients','l’échelle supérieure'],[89],6,
         ['facilitant les premiers soins de secours avant le transfert des patients à l’échelle supérieure']),
    ]
    for n,(title,nodes,pgs,c,facts) in enumerate(flows,1):
        def render(d,title=title,nodes=nodes,n=n):
            wrapped(d,title,(76,120),1050,51,2)
            count=len(nodes); width=440 if count==2 else 280
            for i,label in enumerate(nodes):
                x=90+i*(width+65)
                box(d,(x,295,x+width,480),NAVY,ORANGE,3,22)
                wrapped(d,label,(x+24,335),width-48,39,3)
                if i<count-1:
                    if n==2: # Efforts explicitement parallèles, pas succession imposée.
                        line(d,[(x+width+12,370),(x+width+50,370)],ORANGE,5)
                        line(d,[(x+width+12,395),(x+width+50,395)],ORANGE,5)
                    else: arrow(d,x+width+8,385,48)
        caption=('Schéma des deux horizons de réforme menés en parallèle ; aucun calendrier chiffré ajouté.' if n==2 else 'Schéma d’un parcours ou d’une transition explicitement décrit dans le Livre blanc ; aucune échéance ajoutée.')
        save('frise',n,title,[title]+nodes,pgs,facts,caption,
             title+' : '+(' et '.join(nodes) if n==2 else ' puis '.join(nodes))+'. '+caption,c,draw=render)
    (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'{len(manifest)} images principales, {len(manifest)} variantes mobiles.')
    print('PDF SHA256 : '+hashlib.sha256(PDF.read_bytes()).hexdigest())

if __name__=='__main__': main()
