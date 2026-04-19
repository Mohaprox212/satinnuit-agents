'use strict';

/**
 * SatinNuit — Agent SEO Autonome
 *
 * Actions hebdomadaires (lundi 7h00 Paris) :
 *  1. Publie un article de blog SEO optimisé sur la boutique Shopify
 *  2. Optimise les meta title/description du produit principal
 *  3. Vérifie et améliore les pages statiques (À propos, Contact)
 *  4. Audite le contenu existant (articles, mots-clés)
 *  5. Envoie un rapport détaillé par email
 */

const https = require('https');
const { sendEmail } = require('../utils/mailer');

const STORE       = process.env.SHOPIFY_STORE || 'ggz3rz-cx.myshopify.com';
const TOKEN       = process.env.SHOPIFY_TOKEN || '';
const BLOG_ID     = process.env.SHOPIFY_BLOG_ID || '124368126335';   // Blog "Actualités"
const PRODUCT_ID  = process.env.PRODUCT_NUMERIC_ID || '15619012886911';

// ─── REST helper ─────────────────────────────────────────────────────────────

function rest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: STORE,
      path    : `/admin/api/2024-10${path}`,
      method,
      headers : {
        'Content-Type'           : 'application/json',
        'X-Shopify-Access-Token' : TOKEN,
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch (e) { resolve({ status: res.statusCode, data: d }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ─── Bibliothèque d'articles SEO ─────────────────────────────────────────────
// 10 articles rédigés, optimisés pour les mots-clés SatinNuit
// Publiés à raison d'1/semaine → 10 semaines de contenu

const ARTICLE_LIBRARY = [
  {
    title  : 'Bonnet Satin Nuit : Pourquoi C\'est Indispensable pour Vos Cheveux',
    handle : 'bonnet-satin-nuit-indispensable-cheveux',
    tags   : 'bonnet satin, protéger cheveux nuit, cheveux bouclés, routine capillaire',
    seo_title: 'Bonnet Satin Nuit : Bienfaits et Conseils | SatinNuit',
    seo_desc : 'Découvrez pourquoi le bonnet satin nuit est essentiel pour protéger vos cheveux pendant le sommeil. Conseils, astuces et guide complet.',
    image_alt: 'Bonnet satin nuit pour protéger les cheveux',
    body_html: `
<h2>Pourquoi dormir avec un bonnet satin change tout pour vos cheveux</h2>
<p>Vous vous réveillez chaque matin avec des cheveux emmêlés, secs et indisciplinés ? Le <strong>bonnet satin nuit</strong> est peut-être la solution que vous cherchez. Utilisé depuis des décennies dans les routines capillaires des femmes à cheveux naturels, il connaît aujourd'hui un véritable engouement auprès de toutes les textures de cheveux.</p>

<h2>Le frottement nocturne : ennemi numéro 1 de vos cheveux</h2>
<p>Pendant votre sommeil, vos cheveux frottent contre la taie d'oreiller en coton pendant 7 à 8 heures. Ce frottement répété provoque :</p>
<ul>
  <li><strong>La casse des fibres capillaires</strong> — les cheveux bouclés et crépus sont particulièrement fragiles</li>
  <li><strong>Le dessèchement</strong> — le coton absorbe l'humidité et les huiles naturelles de vos cheveux</li>
  <li><strong>Les frisottis</strong> — la friction soulève les écailles du cheveu, créant du volume indésirable</li>
  <li><strong>Le défrisage prématuré</strong> — vos coiffures tiennent moins longtemps</li>
</ul>

<h2>Comment le satin protège-t-il vos cheveux ?</h2>
<p>Contrairement au coton, le satin est une matière à surface lisse qui <strong>réduit les frottements de 90%</strong>. Résultat :</p>
<ul>
  <li>Vos cheveux gardent leur hydratation naturelle</li>
  <li>Les coiffures (tresses, vanilles, twist-out) sont préservées plus longtemps</li>
  <li>Moins de nœuds et d'emmêlements au réveil</li>
  <li>Une brillance naturelle conservée</li>
</ul>

<h2>Qui devrait porter un bonnet satin la nuit ?</h2>
<p>Le bonnet satin nuit est recommandé pour <strong>tous les types de cheveux</strong>, mais il est particulièrement bénéfique pour :</p>
<ul>
  <li>Les cheveux bouclés (type 3A à 3C)</li>
  <li>Les cheveux crépus et frisés (type 4A à 4C)</li>
  <li>Les personnes portant des extensions, tresses ou locs</li>
  <li>Les cheveux colorés ou chimiquement traités</li>
  <li>Les cheveux fins et fragiles</li>
</ul>

<h2>Comment bien choisir son bonnet satin ?</h2>
<p>Tous les bonnets satin ne se valent pas. Voici les critères à vérifier :</p>
<ul>
  <li><strong>La matière</strong> : privilégiez le satin de polyester de qualité, doux et résistant</li>
  <li><strong>La taille</strong> : le bonnet doit couvrir toute la chevelure sans être trop serré</li>
  <li><strong>L'élastique</strong> : un élastique trop serré peut causer des casses sur la lisière</li>
  <li><strong>La double couche</strong> : pour une protection renforcée et un bonnet réversible pratique</li>
</ul>

<h2>Comment intégrer le bonnet satin dans votre routine ?</h2>
<p>Pour maximiser les bénéfices de votre <strong>bonnet satin nuit</strong> :</p>
<ol>
  <li>Appliquez un sérum ou une huile légère sur vos longueurs avant de dormir</li>
  <li>Regroupez vos cheveux en "ananas" (chignon haut) ou en deux nattes</li>
  <li>Enfilez le bonnet en commençant par l'avant du crâne</li>
  <li>Le matin, défaites vos cheveux et rafraîchissez avec de l'eau ou un spray hydratant</li>
</ol>

<p>Chez <strong>SatinNuit</strong>, notre bonnet double couche réversible est disponible en 14 coloris pour s'adapter à votre style. <a href="/products/bonnet-satin-nuit-double-couche-reversible-protege-hydrate-tous-types-de-cheveux">Découvrez notre collection →</a></p>
`,
  },

  {
    title  : '7 Erreurs à Éviter Avec Votre Bonnet Satin',
    handle : '7-erreurs-bonnet-satin-nuit',
    tags   : 'bonnet satin, erreurs capillaires, cheveux naturels, routine nuit',
    seo_title: '7 Erreurs à Éviter avec Votre Bonnet Satin | SatinNuit',
    seo_desc : 'Utilisez-vous correctement votre bonnet satin ? Évitez ces 7 erreurs fréquentes pour maximiser la protection de vos cheveux chaque nuit.',
    image_alt: 'Erreurs à éviter avec le bonnet satin nuit',
    body_html: `
<h2>7 erreurs fréquentes avec le bonnet satin (et comment les corriger)</h2>
<p>Le <strong>bonnet satin</strong> est un outil capillaire puissant, mais encore faut-il l'utiliser correctement ! Voici les 7 erreurs les plus fréquentes et comment les éviter pour des cheveux parfaitement protégés chaque matin.</p>

<h2>Erreur 1 : Porter le bonnet sur des cheveux complètement secs</h2>
<p>Dormir avec des cheveux totalement secs sans aucun produit hydratant nuit à leur santé. <strong>La solution :</strong> appliquez quelques gouttes d'huile ou un crème légère avant d'enfiler le bonnet pour "sceller" l'hydratation.</p>

<h2>Erreur 2 : Choisir un bonnet trop petit</h2>
<p>Un bonnet trop petit comprime vos cheveux, crée des marques et accélère la casse, surtout sur les bords et la nuque. <strong>La solution :</strong> choisissez un bonnet à taille unique avec un élastique souple, comme notre modèle double couche qui s'adapte à tous les volumes.</p>

<h2>Erreur 3 : Négliger de regrouper les cheveux avant de l'enfiler</h2>
<p>Laisser les cheveux libres dans le bonnet génère des frottements internes. <strong>La solution :</strong> faites un "ananas" (chignon lâche haut sur la tête) ou deux nattes lâches avant de mettre votre bonnet.</p>

<h2>Erreur 4 : Utiliser du satin de mauvaise qualité</h2>
<p>Un satin bas de gamme peut se déchirer rapidement et perdre sa douceur au lavage. <strong>La solution :</strong> investissez dans un bonnet de qualité supérieure. Le prix est vite rentabilisé par la protection offerte à vos cheveux.</p>

<h2>Erreur 5 : Ne jamais laver son bonnet</h2>
<p>Un bonnet qui accumule les résidus de produits est une source de bactéries et bouche vos pores. <strong>La solution :</strong> lavez votre bonnet une fois par semaine à la main ou en machine à 30°C, et laissez-le sécher à l'air libre.</p>

<h2>Erreur 6 : Porter le bonnet trop en arrière</h2>
<p>Si le bonnet ne couvre pas votre lisière frontale, celle-ci n'est pas protégée des frottements. <strong>La solution :</strong> positionnez le bonnet de façon à couvrir entièrement votre front et vos tempes.</p>

<h2>Erreur 7 : Penser que le bonnet suffit pour les locs et les tresses longues</h2>
<p>Pour les tresses ou locs longs, un seul bonnet peut ne pas suffire. <strong>La solution :</strong> utilisez un bonnet plus grand, un foulard satin ou associez les deux pour une protection complète.</p>

<p>Notre <strong>bonnet satin double couche réversible SatinNuit</strong> est conçu pour éviter toutes ces erreurs : taille universelle, satin premium, double couche protectrice. <a href="/products/bonnet-satin-nuit-double-couche-reversible-protege-hydrate-tous-types-de-cheveux">Voir le produit →</a></p>
`,
  },

  {
    title  : 'Routine Capillaire Nuit : Le Guide Complet pour Cheveux Bouclés',
    handle : 'routine-capillaire-nuit-cheveux-boucles',
    tags   : 'routine nuit, cheveux bouclés, bonnet satin, hydratation cheveux',
    seo_title: 'Routine Capillaire Nuit pour Cheveux Bouclés | SatinNuit',
    seo_desc : 'Guide complet pour une routine capillaire nocturne efficace : produits, gestes, bonnet satin et astuces pour préserver vos boucles. Découvrez comment.',
    image_alt: 'Routine capillaire nuit pour cheveux bouclés avec bonnet satin',
    body_html: `
<h2>La routine capillaire nuit idéale pour cheveux bouclés</h2>
<p>Les <strong>cheveux bouclés</strong> demandent une attention particulière, surtout la nuit. Sans les bons gestes, vous risquez de vous réveiller avec des boucles aplaties, des frisottis et des cheveux secs. Voici la routine nocturne complète pour protéger et nourrir vos boucles pendant votre sommeil.</p>

<h2>Étape 1 : L'hydratation avant tout (15 minutes avant le coucher)</h2>
<p>Commencez par hydrater vos cheveux si nécessaire. Si vos cheveux sont secs, pulvérisez légèrement de l'eau et appliquez :</p>
<ul>
  <li><strong>Une crème sans rinçage</strong> — pour nourrir et définir les boucles</li>
  <li><strong>Quelques gouttes d'huile</strong> (argan, jojoba, coco) — pour sceller l'hydratation</li>
</ul>
<p>Évitez les produits trop lourds qui alourdiront vos cheveux et rendront votre bonnet inefficace.</p>

<h2>Étape 2 : Choisir la bonne coiffure de nuit</h2>
<p>La coiffure de nuit est essentielle pour préserver la définition de vos boucles :</p>
<ul>
  <li><strong>L'ananas</strong> — rassemblez tous vos cheveux en un chignon très haut et lâche avec un scrunchie satin. Idéal pour les cheveux mi-longs à longs.</li>
  <li><strong>Deux nattes</strong> — tressez deux nattes lâches pour des boucles définies le matin</li>
  <li><strong>Les twist de nuit</strong> — twistez vos cheveux par petites sections pour un twist-out parfait au réveil</li>
</ul>

<h2>Étape 3 : Le bonnet satin — étape incontournable</h2>
<p>Une fois votre coiffure de nuit prête, enfilez votre <strong>bonnet satin</strong>. Veillez à :</p>
<ul>
  <li>Couvrir toute la chevelure, y compris la lisière</li>
  <li>Vérifier que l'élastique ne serre pas trop</li>
  <li>Ajuster le bonnet pour qu'il ne glisse pas pendant la nuit</li>
</ul>

<h2>Étape 4 : La routine du matin</h2>
<p>Le lendemain matin, voici comment rafraîchir vos boucles :</p>
<ol>
  <li>Retirez délicatement le bonnet et défaites votre coiffure de nuit</li>
  <li>Pulvérisez légèrement de l'eau ou un spray "refresh"</li>
  <li>Séparez doucement les boucles avec vos doigts (jamais avec un peigne)</li>
  <li>Appliquez un gel léger si nécessaire pour définir</li>
  <li>Laissez sécher à l'air ou avec un diffuseur</li>
</ol>

<h2>Les produits recommandés pour votre routine nuit</h2>
<ul>
  <li><strong>Crème sans rinçage</strong> : choisissez-en une riche en beurre de karité ou en aloe vera</li>
  <li><strong>Huile légère</strong> : l'huile d'argan ou de sésame pour sceller sans alourdir</li>
  <li><strong>Scrunchie satin</strong> : pour l'ananas, évitez les élastiques en tissu qui arrachent</li>
  <li><strong>Bonnet satin double couche</strong> : notre bonnet SatinNuit est parfait pour cette routine</li>
</ul>

<p>Avec cette routine, attendez-vous à des boucles définies, hydratées et sans frisottis dès le réveil. Découvrez notre <a href="/products/bonnet-satin-nuit-double-couche-reversible-protege-hydrate-tous-types-de-cheveux">bonnet satin double couche réversible →</a></p>
`,
  },

  {
    title  : 'Bonnet Satin vs Taie d\'Oreiller Satin : Lequel Choisir ?',
    handle : 'bonnet-satin-vs-taie-oreiller-satin',
    tags   : 'bonnet satin, taie oreiller satin, comparatif, protection cheveux nuit',
    seo_title: 'Bonnet Satin vs Taie d\'Oreiller Satin : Comparatif Complet | SatinNuit',
    seo_desc : 'Bonnet satin ou taie d\'oreiller satin : quelle option protège le mieux vos cheveux la nuit ? Comparatif complet, avantages et inconvénients.',
    image_alt: 'Comparatif bonnet satin et taie oreiller satin',
    body_html: `
<h2>Bonnet satin ou taie d'oreiller satin : le grand débat</h2>
<p>Deux solutions existent pour protéger vos cheveux la nuit : le <strong>bonnet satin</strong> et la <strong>taie d'oreiller satin</strong>. Les deux sont efficaces, mais chacun présente des avantages et des limites. On fait le point.</p>

<h2>Le bonnet satin : la protection totale</h2>
<h3>Avantages</h3>
<ul>
  <li><strong>Protection 360°</strong> — vos cheveux sont complètement enveloppés, peu importe vos mouvements pendant la nuit</li>
  <li><strong>Efficace pour les coiffures élaborées</strong> — tresses, locs, twist, vanilles : tout est protégé</li>
  <li><strong>Idéal si vous bougez beaucoup</strong> — pas de risque de sortir la tête de la protection</li>
  <li><strong>Portable</strong> — parfait pour les voyages, hôtels, chez des amis</li>
</ul>
<h3>Inconvénients</h3>
<ul>
  <li>Peut glisser pendant la nuit si l'élastique est usé</li>
  <li>Sensation de chaleur pour certaines personnes en été</li>
</ul>

<h2>La taie d'oreiller satin : le confort discret</h2>
<h3>Avantages</h3>
<ul>
  <li><strong>Confort absolu</strong> — aucune pression sur la tête, idéal pour les dormeurs sur le côté</li>
  <li><strong>Naturel</strong> — pas de geste supplémentaire à adopter</li>
  <li><strong>Recommandée pour les cheveux courts</strong> et les styles qui doivent rester "au naturel"</li>
</ul>
<h3>Inconvénients</h3>
<ul>
  <li><strong>Protection incomplète</strong> — si vous bougez, une partie de vos cheveux peut frotter sur le coton</li>
  <li><strong>Ne protège pas la nuque</strong> — la zone la plus fragile reste exposée</li>
  <li><strong>Coût plus élevé</strong> — une bonne taie satin est plus chère qu'un bonnet</li>
  <li>Pas portable pour les voyages (oreiller non fourni)</li>
</ul>

<h2>Notre verdict : lequel choisir ?</h2>
<p>Pour une protection maximale, surtout si vous avez des <strong>cheveux bouclés, crépus ou des coiffures élaborées</strong>, le <strong>bonnet satin reste le choix numéro 1</strong>. La taie d'oreiller est un bon complément, mais ne remplace pas la protection totale du bonnet.</p>
<p>La solution idéale ? Les deux ! Portez votre bonnet satin ET dormez sur une taie satin pour une protection ultime.</p>

<p>Notre <strong>bonnet satin double couche réversible SatinNuit</strong> offre le meilleur des deux mondes : double protection, satin premium et taille universelle. <a href="/products/bonnet-satin-nuit-double-couche-reversible-protege-hydrate-tous-types-de-cheveux">Commander le vôtre →</a></p>
`,
  },

  {
    title  : 'Comment Protéger Vos Cheveux Crépus la Nuit : Guide Complet',
    handle : 'proteger-cheveux-crepus-nuit-guide',
    tags   : 'cheveux crépus, bonnet satin, protection nuit, cheveux naturels type 4',
    seo_title: 'Protéger Cheveux Crépus la Nuit : Guide Complet | SatinNuit',
    seo_desc : 'Comment protéger vos cheveux crépus et naturels pendant le sommeil ? Routines, produits et astuces pour préserver vos cheveux type 4 chaque nuit.',
    image_alt: 'Protéger cheveux crépus la nuit avec bonnet satin',
    body_html: `
<h2>La protection nocturne pour cheveux crépus : pourquoi c'est crucial</h2>
<p>Les <strong>cheveux crépus</strong> (type 4A, 4B, 4C) sont les plus fragiles de toutes les textures. Leur structure en zigzag les rend naturellement poreux et sujets à la déshydratation. La nuit, sans protection, c'est plusieurs heures de frottement sur du coton qui endommagent progressivement vos cheveux. Voici comment y remédier.</p>

<h2>Comprendre la structure des cheveux crépus</h2>
<p>Les cheveux crépus ont une particularité : leurs écailles capillaires restent naturellement légèrement ouvertes, ce qui :</p>
<ul>
  <li>Favorise la déshydratation rapide</li>
  <li>Rend la casse plus fréquente</li>
  <li>Amplifie les effets des frottements nocturnes</li>
</ul>
<p>C'est pourquoi la routine de nuit est particulièrement importante pour les cheveux type 4.</p>

<h2>Les 5 piliers de la protection nocturne pour cheveux crépus</h2>

<h3>1. La méthode LOC ou LCO avant de dormir</h3>
<p>Appliquez les produits dans cet ordre pour maximiser l'hydratation :</p>
<ul>
  <li><strong>L (Liquid)</strong> — eau ou brume hydratante</li>
  <li><strong>O (Oil)</strong> — huile (coco, ricin, olive) pour sceller</li>
  <li><strong>C (Cream)</strong> — crème épaisse pour nourrir en profondeur</li>
</ul>

<h3>2. Protéger les extrémités</h3>
<p>Les pointes sont les parties les plus âgées et les plus fragiles. Appliquez une noisette de beurre de karité ou d'avocat sur vos extrémités avant de dormir.</p>

<h3>3. La coiffure de protection</h3>
<p>Pour les cheveux crépus, les meilleures coiffures de nuit sont :</p>
<ul>
  <li><strong>Les bantu knots</strong> — pour des boucles définies le matin</li>
  <li><strong>Les flat twists</strong> — pour protéger les longueurs</li>
  <li><strong>L'ananas modifié</strong> — sections séparées pour plus de volume</li>
</ul>

<h3>4. Le bonnet satin — non négociable</h3>
<p>Pour les cheveux crépus, le <strong>bonnet satin nuit</strong> n'est pas un luxe, c'est une nécessité. Il maintient les produits contre vos cheveux et évite la perte d'humidité vers le coton de votre oreiller.</p>

<h3>5. Humidifier l'air ambiant</h3>
<p>En hiver, le chauffage assèche l'air et donc vos cheveux. Un humidificateur dans votre chambre peut faire une différence significative.</p>

<h2>Les erreurs spécifiques aux cheveux crépus la nuit</h2>
<ul>
  <li>Aller se coucher sur des cheveux complètement secs</li>
  <li>Utiliser un bonnet en polyester non satiné (trop rugueux)</li>
  <li>Négliger la nuque et les bords</li>
  <li>Tresser trop serré pour la nuit (risque de traction alopécie)</li>
</ul>

<p>Chez SatinNuit, nous avons conçu notre <strong>bonnet double couche réversible</strong> spécialement pour répondre aux besoins des cheveux crépus et naturels. Disponible en 14 coloris. <a href="/products/bonnet-satin-nuit-double-couche-reversible-protege-hydrate-tous-types-de-cheveux">Découvrir →</a></p>
`,
  },

  {
    title  : 'Entretien des Locs et Dreadlocks la Nuit : Nos Conseils',
    handle : 'entretien-locs-dreadlocks-nuit-bonnet-satin',
    tags   : 'locs, dreadlocks, bonnet satin, protection nuit, entretien locs',
    seo_title: 'Protéger Locs et Dreadlocks la Nuit : Guide | SatinNuit',
    seo_desc : 'Comment entretenir vos locs et dreadlocks pendant le sommeil ? Bonnet satin, foulard, et routines nocturnes adaptées aux locs de toutes longueurs.',
    image_alt: 'Bonnet satin pour protéger les locs la nuit',
    body_html: `
<h2>Protéger ses locs la nuit : pourquoi c'est important</h2>
<p>Les <strong>locs et dreadlocks</strong> demandent autant de soin la nuit que les cheveux non locked. Sans protection, ils peuvent se dessécher, se feutrer de façon non souhaitée et perdre leur définition. Voici comment les protéger efficacement pendant votre sommeil.</p>

<h2>Les problèmes spécifiques des locs la nuit</h2>
<ul>
  <li><strong>L'absorption du coton</strong> — les locs jeunes ou ouverts absorbent rapidement l'humidité</li>
  <li><strong>Le feutrage non contrôlé</strong> — les frottements peuvent feutrer des locs entre eux</li>
  <li><strong>La sécheresse</strong> — les locs matures ont besoin d'hydratation régulière</li>
  <li><strong>La casse des extrémités</strong> — les pointes restent délicates même sur des locs matures</li>
</ul>

<h2>Le bonnet satin pour locs : taille et positionnement</h2>
<p>Choisir le bon bonnet est crucial pour les porteurs de locs :</p>
<ul>
  <li><strong>Locs courts à mi-longs</strong> : un bonnet satin standard suffit</li>
  <li><strong>Locs longs</strong> : optez pour un grand bonnet ou un "jumbo bonnet" qui peut contenir tout le volume</li>
  <li><strong>Locs extra-longs</strong> : utilisez un bonnet pour le dessus + un foulard satin pour les longueurs</li>
</ul>

<h2>Routine nocturne pour locs en 4 étapes</h2>
<ol>
  <li><strong>Hydrater légèrement</strong> — spray d'eau + quelques gouttes d'huile légère sur les locs (pas trop, les locs jeunes ne doivent pas être trop mouillés la nuit)</li>
  <li><strong>Regrouper les locs</strong> — rassemblez vos locs en une tresse lâche ou en chignon pour éviter les frottements entre eux</li>
  <li><strong>Enfiler le bonnet satin</strong> — couvrez toute la chevelure</li>
  <li><strong>Le matin</strong> — déposez vos locs, vaporisez légèrement si besoin</li>
</ol>

<h2>Conseils supplémentaires pour locs sains</h2>
<ul>
  <li>Dormez sur une taie d'oreiller satin en complément du bonnet</li>
  <li>Évitez de dormir sur des locs complètement mouillés (risque de moisissure et d'odeurs)</li>
  <li>Pour les locs bébés et jeunes, optez pour le foulard plutôt que le bonnet pour ne pas abîmer le feutrage</li>
</ul>

<p>Notre <strong>bonnet satin double couche SatinNuit</strong> est assez spacieux pour accueillir la plupart des styles de locs. <a href="/products/bonnet-satin-nuit-double-couche-reversible-protege-hydrate-tous-types-de-cheveux">Voir le produit →</a></p>
`,
  },

  {
    title  : 'Satin vs Soie : Quelle Matière Choisir pour Vos Cheveux ?',
    handle : 'satin-vs-soie-cheveux-comparatif',
    tags   : 'satin, soie, bonnet cheveux, comparatif matières, cheveux naturels',
    seo_title: 'Satin vs Soie pour les Cheveux : Quelle Différence ? | SatinNuit',
    seo_desc : 'Satin ou soie pour protéger vos cheveux la nuit ? Découvrez les différences de matières, les bienfaits de chaque option et laquelle est la plus efficace.',
    image_alt: 'Comparatif satin et soie pour les cheveux',
    body_html: `
<h2>Satin ou soie : laquelle est la meilleure pour les cheveux ?</h2>
<p>On entend souvent parler de <strong>satin</strong> et de <strong>soie</strong> pour la protection capillaire nocturne. Mais ces deux matières sont-elles équivalentes ? Voici tout ce qu'il faut savoir pour faire le bon choix.</p>

<h2>La soie naturelle : luxueuse mais coûteuse</h2>
<p>La soie est une fibre naturelle produite par le ver à soie. Ses caractéristiques :</p>
<ul>
  <li><strong>Surface ultra-lisse</strong> — réduit les frottements au maximum</li>
  <li><strong>Thermorégulante</strong> — fraîche en été, légèrement chauffante en hiver</li>
  <li><strong>Faible absorption</strong> — ne pompe pas l'humidité des cheveux</li>
  <li><strong>Protéines naturelles</strong> — certaines études suggèrent des bénéfices sur la fibre capillaire</li>
  <li><strong>Prix élevé</strong> — un vrai bonnet soie naturelle coûte entre 30€ et 80€</li>
  <li><strong>Entretien délicat</strong> — lavage à la main obligatoire</li>
</ul>

<h2>Le satin : efficace et accessible</h2>
<p>Le satin est une technique de tissage, et non une fibre. On trouve du satin en polyester, en acétate ou en soie. Le satin polyester est le plus répandu :</p>
<ul>
  <li><strong>Surface lisse comparable à la soie</strong> — réduction des frottements quasi identique</li>
  <li><strong>Beaucoup plus abordable</strong> — 5€ à 20€ pour un bonnet satin de qualité</li>
  <li><strong>Résistant et durable</strong> — supporte les lavages en machine</li>
  <li><strong>Large choix de coloris</strong> — pour tous les styles</li>
  <li><strong>Légèrement moins respirant</strong> que la soie naturelle</li>
</ul>

<h2>Comparatif : satin vs soie pour la protection capillaire</h2>
<table>
  <thead>
    <tr>
      <th>Critère</th>
      <th>Satin polyester</th>
      <th>Soie naturelle</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>Réduction des frottements</td><td>Très élevée ✅</td><td>Très élevée ✅</td></tr>
    <tr><td>Rétention d'humidité</td><td>Bonne ✅</td><td>Excellente ✅✅</td></tr>
    <tr><td>Prix</td><td>Accessible ✅</td><td>Élevé ❌</td></tr>
    <tr><td>Durabilité</td><td>Bonne ✅</td><td>Délicate ⚠️</td></tr>
    <tr><td>Entretien</td><td>Machine 30°C ✅</td><td>Main seulement ⚠️</td></tr>
    <tr><td>Disponibilité</td><td>Large choix ✅</td><td>Limitée ⚠️</td></tr>
  </tbody>
</table>

<h2>Notre conclusion</h2>
<p>Pour 95% des utilisateurs, le <strong>satin polyester de qualité</strong> offre les mêmes bénéfices protecteurs que la soie, à une fraction du prix. La soie reste un luxe pour celles qui veulent l'absolu, mais n'est pas nécessaire pour des cheveux sains.</p>

<p>Notre <strong>bonnet satin SatinNuit</strong> est fabriqué en satin polyester haute qualité, doux et résistant. <a href="/products/bonnet-satin-nuit-double-couche-reversible-protege-hydrate-tous-types-de-cheveux">Découvrir →</a></p>
`,
  },

  {
    title  : 'Comment Préserver Votre Twist-Out et Braid-Out Toute la Semaine',
    handle : 'preserver-twist-out-braid-out-semaine-bonnet-satin',
    tags   : 'twist-out, braid-out, bonnet satin, cheveux naturels, coiffures protectrices',
    seo_title: 'Préserver Twist-Out et Braid-Out Toute la Semaine | SatinNuit',
    seo_desc : 'Vos twist-out et braid-out tiennent-ils plus de 2 jours ? Découvrez nos astuces pour préserver vos coiffures naturelles toute la semaine avec un bonnet satin.',
    image_alt: 'Préserver twist-out et braid-out avec bonnet satin',
    body_html: `
<h2>Faire durer votre twist-out plus d'une semaine</h2>
<p>Le <strong>twist-out</strong> et le <strong>braid-out</strong> sont parmi les coiffures naturelles les plus populaires. Mais qui dit que ces coiffures doivent recommencer de zéro tous les deux jours ? Avec les bonnes techniques, votre twist-out peut tenir toute une semaine. Le <strong>bonnet satin</strong> est votre allié principal.</p>

<h2>Jour 1 : Réaliser un twist-out parfait</h2>
<p>Pour un twist-out longue durée, quelques règles de base :</p>
<ul>
  <li>Commencez sur des cheveux propres et bien hydratés</li>
  <li>Appliquez une crème définissante + une huile légère sur chaque section</li>
  <li>Twistez bien serré mais sans trop forcer</li>
  <li>Laissez sécher complètement (air libre ou diffuseur) avant de défaire</li>
</ul>

<h2>La nuit 1 à 3 : Le bonnet satin classique</h2>
<p>Les premières nuits, votre twist-out est bien défini. Pour le préserver :</p>
<ul>
  <li>Rassemblez vos cheveux en ananas (chignon haut lâche)</li>
  <li>Enfilez votre <strong>bonnet satin</strong></li>
  <li>Le matin, défaites l'ananas et séparez légèrement les boucles avec les doigts</li>
  <li>Sprayez légèrement avec de l'eau si nécessaire</li>
</ul>

<h2>Nuit 3 à 5 : Refresh et retwist des sections</h2>
<p>À partir du 3ème jour, quelques sections peuvent commencer à perdre de la définition :</p>
<ul>
  <li>Retwistez uniquement les sections qui ont lâché (pas toute la tête)</li>
  <li>Appliquez une crème légère sur les zones sèches</li>
  <li>Remettez l'ananas + bonnet satin</li>
</ul>

<h2>Nuit 5 à 7 : Le mini-ananas multiple</h2>
<p>En fin de semaine, faites plusieurs ananas sur la tête (4 à 6) pour maintenir le volume et la définition dans chaque zone.</p>

<h2>Les erreurs qui font "casser" un twist-out prématurément</h2>
<ul>
  <li>Dormir sans bonnet (le coton absorbe et défrise)</li>
  <li>Toucher trop souvent ses cheveux pendant la journée</li>
  <li>Dormir sur des cheveux humides</li>
  <li>Utiliser trop de produit les jours de refresh (accumulation)</li>
</ul>

<p>Avec notre <strong>bonnet satin double couche SatinNuit</strong>, vos coiffures twist-out tiennent facilement 5 à 7 jours. <a href="/products/bonnet-satin-nuit-double-couche-reversible-protege-hydrate-tous-types-de-cheveux">Commander →</a></p>
`,
  },

  {
    title  : 'Les 5 Meilleurs Huiles pour Cheveux à Utiliser Avant Votre Bonnet Satin',
    handle : '5-meilleures-huiles-cheveux-avant-bonnet-satin',
    tags   : 'huile cheveux, bonnet satin, hydratation, huile argan, huile coco',
    seo_title: '5 Meilleures Huiles Cheveux à Utiliser Avant Votre Bonnet Satin | SatinNuit',
    seo_desc : 'Quelle huile appliquer avant de mettre votre bonnet satin ? Argan, coco, ricin, jojoba… Guide complet des meilleures huiles capillaires pour la nuit.',
    image_alt: 'Huiles capillaires à utiliser avec bonnet satin nuit',
    body_html: `
<h2>Quelle huile utiliser avant de mettre votre bonnet satin ?</h2>
<p>Appliquer une huile sur vos cheveux avant d'enfiler votre <strong>bonnet satin</strong> est une étape clé de la routine nocturne. L'huile "scelle" l'hydratation dans le cheveu et protège la fibre capillaire pendant la nuit. Mais toutes les huiles ne se valent pas. Voici les 5 meilleures.</p>

<h2>1. L'huile d'argan — l'or liquide du Maroc</h2>
<p><strong>Idéale pour :</strong> tous types de cheveux, surtout les cheveux fins et colorés</p>
<ul>
  <li>Ultra-légère, ne graisse pas les cheveux</li>
  <li>Riche en vitamine E et acides gras</li>
  <li>Apporte brillance et douceur</li>
  <li>Réduit les frisottis efficacement</li>
</ul>
<p><strong>Comment l'utiliser :</strong> 3 à 5 gouttes sur les longueurs et les pointes, jamais sur les racines.</p>

<h2>2. L'huile de coco — la classique indétrônable</h2>
<p><strong>Idéale pour :</strong> cheveux crépus et très poreux</p>
<ul>
  <li>Pénètre dans la fibre capillaire (contrairement à la plupart des huiles)</li>
  <li>Anti-casse et renforçante</li>
  <li>Excellente pour les pointes abîmées</li>
</ul>
<p><strong>Comment l'utiliser :</strong> faites fondre une noisette entre vos paumes, appliquez sur les longueurs. Attention : certaines personnes réagissent à l'huile de coco (protéine sensitivity).</p>

<h2>3. L'huile de ricin — pour la pousse et la densité</h2>
<p><strong>Idéale pour :</strong> cheveux qui cassent, lisière et nuque clairsemées</p>
<ul>
  <li>Épaisse et nourrissante en profondeur</li>
  <li>Stimule la microcirculation du cuir chevelu</li>
  <li>Renforce les cheveux fragiles</li>
</ul>
<p><strong>Comment l'utiliser :</strong> diluez avec une huile plus légère (argan ou jojoba) car très épaisse. Idéale pour un massage du cuir chevelu avant de dormir.</p>

<h2>4. L'huile de jojoba — la plus proche du sébum naturel</h2>
<p><strong>Idéale pour :</strong> cuir chevelu gras ou sensible, cheveux fins</p>
<ul>
  <li>Composition proche du sébum humain</li>
  <li>Équilibre la production de sébum</li>
  <li>Non comédogène</li>
  <li>Légère et rapidement absorbée</li>
</ul>

<h2>5. L'huile d'avocat — la nourricière</h2>
<p><strong>Idéale pour :</strong> cheveux très secs, crépus et poreux</p>
<ul>
  <li>Riche en vitamines A, D, E et en acide oléique</li>
  <li>Nourrissante en profondeur sans alourdir</li>
  <li>Parfaite pour les nuits de "deep conditioning"</li>
</ul>

<h2>Comment combiner huile + bonnet satin ?</h2>
<ol>
  <li>Appliquez l'huile de votre choix sur des cheveux légèrement humides ou secs</li>
  <li>Massez délicatement les longueurs et les pointes</li>
  <li>Faites votre coiffure de nuit (ananas, nattes, twists)</li>
  <li>Enfilez votre <strong>bonnet satin</strong> — il maintiendra l'huile contre vos cheveux toute la nuit</li>
</ol>

<p>La combinaison huile + bonnet satin est le duo le plus efficace pour des cheveux hydratés et brillants chaque matin. Découvrez notre <a href="/products/bonnet-satin-nuit-double-couche-reversible-protege-hydrate-tous-types-de-cheveux">bonnet satin double couche réversible →</a></p>
`,
  },

  {
    title  : 'Bonnet Satin et Perruques : Comment Protéger Vos Vraies Cheveux',
    handle : 'bonnet-satin-perruques-proteger-cheveux-naturels',
    tags   : 'bonnet satin, perruque, wig, cheveux naturels, protection lisière',
    seo_title: 'Bonnet Satin sous Perruque : Protéger Vos Vrais Cheveux | SatinNuit',
    seo_desc : 'Comment porter un bonnet satin sous votre perruque ? Protégez vos vrais cheveux et votre lisière grâce à notre guide complet pour les porteuses de wigs.',
    image_alt: 'Bonnet satin pour protéger les cheveux sous perruque',
    body_html: `
<h2>Bonnet satin et perruques : le duo indispensable</h2>
<p>De plus en plus de femmes portent des <strong>perruques (wigs)</strong> comme style de protection. Mais sous la perruque, vos vrais cheveux ont besoin d'être protégés aussi, surtout la nuit. Le <strong>bonnet satin</strong> joue alors un rôle essentiel.</p>

<h2>Pourquoi porter un bonnet satin sous la perruque ?</h2>
<p>Même en portant une perruque pendant la journée, la nuit, vos vrais cheveux sont à nu. Sans protection :</p>
<ul>
  <li>La lisière (bords) s'abîme par frottement contre l'oreiller</li>
  <li>Les cheveux en dessous se dessèchent</li>
  <li>Les tresses de base (cornrows) se défont prématurément</li>
  <li>La croissance capillaire ralentit par manque d'hydratation</li>
</ul>

<h2>La routine nuit pour les porteuses de perruques</h2>
<ol>
  <li><strong>Retirez la perruque</strong> — ne dormez jamais avec votre wig, même une nuit</li>
  <li><strong>Hydratez votre lisière</strong> — appliquez une huile légère sur les bords et les tempes</li>
  <li><strong>Massez le cuir chevelu</strong> — après une journée sous une wig, votre cuir chevelu mérite un massage pour stimuler la circulation</li>
  <li><strong>Protégez vos cornrows</strong> — appliquez un beurre ou une crème sur les tresses de base</li>
  <li><strong>Enfilez le bonnet satin</strong> — il protège tout : lisière, tresses de base, cuir chevelu</li>
</ol>

<h2>Comment prendre soin de votre perruque la nuit ?</h2>
<p>Pendant que vous dormez avec votre bonnet satin, votre perruque aussi a besoin d'attention :</p>
<ul>
  <li>Placez-la sur un support à perruque (wig stand)</li>
  <li>Démêlez-la délicatement avant de la poser</li>
  <li>Pour les wigs en cheveux naturels : vaporisez légèrement et couvrez d'un filet</li>
</ul>

<h2>La lisière : zone à surveiller en priorité</h2>
<p>La lisière (baby hair et bords) est la zone la plus fragile pour les porteuses de wigs. La pression de la wig pendant la journée + les frottements nocturnes peuvent mener à une <strong>alopécie de traction</strong>. Pour la protéger :</p>
<ul>
  <li>Appliquez de l'huile de ricin diluée sur les bords chaque soir</li>
  <li>Faites un massage circulaire de 2 minutes</li>
  <li>Couvrez avec le bonnet satin en veillant à bien couvrir les tempes</li>
</ul>

<p>Notre <strong>bonnet satin SatinNuit</strong> est spécialement conçu pour couvrir toute la lisière grâce à son élastique souple et enveloppant. <a href="/products/bonnet-satin-nuit-double-couche-reversible-protege-hydrate-tous-types-de-cheveux">Voir le produit →</a></p>
`,
  },
];

// ─── Sélection de l'article à publier ────────────────────────────────────────

async function selectNextArticle() {
  const resp = await rest('GET', `/blogs/${BLOG_ID}/articles.json?fields=id,title,handle&limit=250`);
  const existing = resp.data?.articles || [];

  // On identifie quels articles de la bibliothèque ont déjà été publiés
  const publishedHandles = new Set(existing.map(a => a.handle));
  const unpublished = ARTICLE_LIBRARY.filter(a => !publishedHandles.has(a.handle));

  if (unpublished.length === 0) {
    // Tous publiés — reprendre depuis le début
    return { article: ARTICLE_LIBRARY[existing.length % ARTICLE_LIBRARY.length], isNew: false };
  }

  return { article: unpublished[0], isNew: true };
}

// ─── Publication d'un article ─────────────────────────────────────────────────

async function publishArticle(articleDef) {
  const publishedAt = new Date().toISOString();

  const payload = {
    article: {
      title        : articleDef.title,
      body_html    : articleDef.body_html,
      published_at : publishedAt,
      tags         : articleDef.tags,
      metafields   : [
        {
          namespace: 'global',
          key      : 'title_tag',
          value    : articleDef.seo_title,
          type     : 'single_line_text_field',
        },
        {
          namespace: 'global',
          key      : 'description_tag',
          value    : articleDef.seo_desc,
          type     : 'single_line_text_field',
        },
      ],
    },
  };

  const resp = await rest('POST', `/blogs/${BLOG_ID}/articles.json`, payload);

  if (resp.status === 201) {
    return {
      success: true,
      id     : resp.data.article.id,
      url    : `https://${STORE.replace('.myshopify.com', '')}.com/blogs/actualites/${articleDef.handle}`,
      title  : articleDef.title,
    };
  } else {
    return {
      success: false,
      error  : JSON.stringify(resp.data).slice(0, 200),
      title  : articleDef.title,
    };
  }
}

// ─── Optimisation SEO du produit principal ────────────────────────────────────

const PRODUCT_SEO = {
  title: 'Bonnet Satin Nuit Double Couche | Protège Tous Types de Cheveux | SatinNuit',
  description: 'Bonnet satin nuit double couche réversible — protège et hydrate cheveux bouclés, crépus, locs et extensions. 14 coloris disponibles. Livraison rapide.',
};

async function optimizeProductMeta() {
  const resp = await rest('GET', `/products/${PRODUCT_ID}.json?fields=id,title,body_html`);
  const product = resp.data?.product;
  if (!product) return { success: false, error: 'Produit non trouvé' };

  // Mettre à jour via metafields SEO
  const updateResp = await rest('PUT', `/products/${PRODUCT_ID}.json`, {
    product: {
      id        : PRODUCT_ID,
      metafields: [
        {
          namespace: 'global',
          key      : 'title_tag',
          value    : PRODUCT_SEO.title,
          type     : 'single_line_text_field',
        },
        {
          namespace: 'global',
          key      : 'description_tag',
          value    : PRODUCT_SEO.description,
          type     : 'single_line_text_field',
        },
      ],
    },
  });

  return {
    success: updateResp.status === 200,
    title  : PRODUCT_SEO.title,
    desc   : PRODUCT_SEO.description,
  };
}

// ─── Audit du contenu existant ────────────────────────────────────────────────

async function auditContent() {
  const [articlesResp, pagesResp] = await Promise.all([
    rest('GET', `/blogs/${BLOG_ID}/articles.json?fields=id,title,handle,created_at,tags&limit=250`),
    rest('GET', '/pages.json?fields=id,title,handle'),
  ]);

  const articles = articlesResp.data?.articles || [];
  const pages    = pagesResp.data?.pages || [];

  // Analyse des mots-clés couverts
  const coveredKeywords = new Set();
  const targetKeywords  = [
    'bonnet satin', 'cheveux bouclés', 'cheveux crépus', 'protéger cheveux',
    'routine nuit', 'locs', 'perruque', 'twist-out', 'huile cheveux', 'satin vs soie',
  ];

  for (const article of articles) {
    const text = (article.title + ' ' + article.tags).toLowerCase();
    for (const kw of targetKeywords) {
      if (text.includes(kw)) coveredKeywords.add(kw);
    }
  }

  const missingKeywords = targetKeywords.filter(kw => !coveredKeywords.has(kw));
  const remainingArticles = ARTICLE_LIBRARY.filter(a => !articles.find(e => e.handle === a.handle));

  return {
    articlesPublished : articles.length,
    articlesRemaining : remainingArticles.length,
    pagesCount        : pages.length,
    coveredKeywords   : [...coveredKeywords],
    missingKeywords,
    articles          : articles.slice(0, 5),
    pages,
  };
}

// ─── Construction du rapport HTML ─────────────────────────────────────────────

function buildSEOReportHtml(publishResult, productMeta, contentAudit, durationMs) {
  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const kwCoverage = Math.round(
    (contentAudit.coveredKeywords.length /
      (contentAudit.coveredKeywords.length + contentAudit.missingKeywords.length)) * 100
  ) || 0;

  const pubStatus = publishResult.success
    ? `<span style="background:#eafaf1;color:#27ae60;padding:3px 10px;border-radius:12px;font-size:13px">✅ Publié</span>`
    : `<span style="background:#fdedec;color:#e74c3c;padding:3px 10px;border-radius:12px;font-size:13px">❌ Erreur</span>`;

  const metaStatus = productMeta.success
    ? `<span style="background:#eafaf1;color:#27ae60;padding:3px 10px;border-radius:12px;font-size:13px">✅ Mis à jour</span>`
    : `<span style="background:#f8f8f8;color:#666;padding:3px 10px;border-radius:12px;font-size:13px">ℹ️ Inchangé</span>`;

  const covKwBadges = contentAudit.coveredKeywords
    .map(kw => `<span style="background:#eafaf1;color:#27ae60;padding:2px 8px;border-radius:10px;font-size:12px;margin:2px;display:inline-block">${esc(kw)}</span>`)
    .join('');
  const misKwBadges = contentAudit.missingKeywords
    .map(kw => `<span style="background:#fff5f5;color:#e74c3c;padding:2px 8px;border-radius:10px;font-size:12px;margin:2px;display:inline-block">${esc(kw)}</span>`)
    .join('');

  const articleRows = contentAudit.articles
    .map(a => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:13px">${esc(a.title)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#999">
          ${new Date(a.created_at).toLocaleDateString('fr-FR')}
        </td>
      </tr>`).join('') || '<tr><td colspan="2" style="padding:12px;color:#999">Aucun article</td></tr>';

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
<div style="max-width:700px;margin:0 auto;background:#fff">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#0f3460,#16213e);padding:32px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:24px;font-weight:300;letter-spacing:2px">🌙 SATINNUIT</h1>
    <p style="color:#a0c4f8;margin:8px 0 0;font-size:13px">RAPPORT SEO HEBDOMADAIRE</p>
    <p style="color:#7090b0;margin:4px 0 0;font-size:12px">${today}</p>
  </div>

  <!-- KPIs -->
  <div style="display:flex;border-bottom:2px solid #f0f0f0">
    <div style="flex:1;padding:20px;text-align:center;border-right:1px solid #f0f0f0">
      <div style="font-size:32px;font-weight:700;color:#0f3460">${contentAudit.articlesPublished}</div>
      <div style="font-size:11px;color:#999;margin-top:4px;text-transform:uppercase;letter-spacing:1px">Articles publiés</div>
    </div>
    <div style="flex:1;padding:20px;text-align:center;border-right:1px solid #f0f0f0">
      <div style="font-size:32px;font-weight:700;color:#0f3460">${contentAudit.articlesRemaining}</div>
      <div style="font-size:11px;color:#999;margin-top:4px;text-transform:uppercase;letter-spacing:1px">Articles restants</div>
    </div>
    <div style="flex:1;padding:20px;text-align:center;border-right:1px solid #f0f0f0">
      <div style="font-size:32px;font-weight:700;color:#0f3460">${kwCoverage}%</div>
      <div style="font-size:11px;color:#999;margin-top:4px;text-transform:uppercase;letter-spacing:1px">Mots-clés couverts</div>
    </div>
    <div style="flex:1;padding:20px;text-align:center">
      <div style="font-size:32px;font-weight:700;color:#0f3460">${(durationMs/1000).toFixed(1)}s</div>
      <div style="font-size:11px;color:#999;margin-top:4px;text-transform:uppercase;letter-spacing:1px">Durée audit</div>
    </div>
  </div>

  <!-- Article publié cette semaine -->
  <div style="padding:24px">
    <h2 style="font-size:15px;font-weight:600;color:#0f3460;margin:0 0 16px;text-transform:uppercase;letter-spacing:1px">
      📝 Article publié cette semaine
    </h2>
    <div style="background:#f8faff;border-left:4px solid #0f3460;padding:16px;border-radius:0 8px 8px 0">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
        <div>
          <p style="margin:0 0 8px;font-size:15px;font-weight:600;color:#1a1a2e">${esc(publishResult.title)}</p>
          ${publishResult.url ? `<a href="${esc(publishResult.url)}" style="color:#0f3460;font-size:12px">${esc(publishResult.url)}</a>` : ''}
          ${publishResult.error ? `<p style="margin:8px 0 0;color:#e74c3c;font-size:12px">Erreur : ${esc(publishResult.error)}</p>` : ''}
        </div>
        <div>${pubStatus}</div>
      </div>
    </div>
  </div>

  <!-- SEO produit -->
  <div style="padding:0 24px 24px">
    <h2 style="font-size:15px;font-weight:600;color:#0f3460;margin:0 0 16px;text-transform:uppercase;letter-spacing:1px">
      🔍 Meta SEO Produit
    </h2>
    <div style="background:#f8f8f8;border-radius:8px;padding:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-size:13px;color:#555">Title SEO</span>
        ${metaStatus}
      </div>
      <p style="margin:0 0 8px;font-size:13px;background:#fff;padding:10px;border-radius:4px;color:#333">
        ${esc(productMeta.title || 'N/A')}
      </p>
      <p style="margin:0;font-size:12px;color:#888">Meta description :</p>
      <p style="margin:4px 0 0;font-size:13px;background:#fff;padding:10px;border-radius:4px;color:#555">
        ${esc(productMeta.desc || 'N/A')}
      </p>
    </div>
  </div>

  <!-- Couverture mots-clés -->
  <div style="padding:0 24px 24px">
    <h2 style="font-size:15px;font-weight:600;color:#0f3460;margin:0 0 16px;text-transform:uppercase;letter-spacing:1px">
      🎯 Couverture des Mots-Clés
    </h2>
    <p style="font-size:13px;color:#555;margin:0 0 10px">Mots-clés couverts :</p>
    <div style="margin-bottom:16px">${covKwBadges || '<span style="color:#999;font-size:13px">Aucun encore</span>'}</div>
    ${misKwBadges ? `
    <p style="font-size:13px;color:#555;margin:0 0 10px">Mots-clés à couvrir (prochains articles) :</p>
    <div>${misKwBadges}</div>
    ` : '<p style="color:#27ae60;font-size:13px">✅ Tous les mots-clés ciblés sont couverts !</p>'}
  </div>

  <!-- Articles publiés -->
  <div style="padding:0 24px 24px">
    <h2 style="font-size:15px;font-weight:600;color:#0f3460;margin:0 0 16px;text-transform:uppercase;letter-spacing:1px">
      📚 Derniers Articles du Blog
    </h2>
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="background:#f8f8f8">
          <th style="padding:10px 12px;text-align:left;font-size:12px;color:#666;font-weight:600">Titre</th>
          <th style="padding:10px 12px;text-align:left;font-size:12px;color:#666;font-weight:600">Date</th>
        </tr>
      </thead>
      <tbody>${articleRows}</tbody>
    </table>
  </div>

  <!-- Recommandations -->
  <div style="margin:0 24px 24px;background:#f0f5ff;border-radius:8px;padding:20px">
    <h3 style="margin:0 0 12px;font-size:14px;color:#0f3460">🤖 Recommandations SEO</h3>
    <ul style="margin:0;padding-left:20px;color:#444;font-size:13px;line-height:1.9">
      ${buildSEORecs(contentAudit, publishResult)}
    </ul>
  </div>

  <!-- Footer -->
  <div style="background:#0f3460;padding:20px;text-align:center">
    <a href="https://admin.shopify.com/store/ggz3rz-cx/blogs/124368126335/articles" style="color:#a0c4f8;font-size:12px;text-decoration:none">
      Voir le blog Shopify →
    </a>
    <p style="color:#4060a0;font-size:11px;margin:8px 0 0">
      SatinNuit SEO Agent · Rapport hebdomadaire automatique
    </p>
  </div>

</div>
</body>
</html>`;
}

function buildSEORecs(audit, pub) {
  const recs = [];
  if (pub.success) {
    recs.push(`📝 Nouvel article publié avec succès : "<strong>${esc(pub.title)}</strong>"`);
  } else {
    recs.push(`❌ La publication de l'article a échoué — vérifiez les permissions du token Shopify.`);
  }
  if (audit.articlesPublished >= 5) {
    recs.push(`🎉 ${audit.articlesPublished} articles publiés ! Votre blog prend de l'ampleur — continuez ce rythme pour un effet SEO significatif dans 2-3 mois.`);
  }
  if (audit.missingKeywords.length > 0) {
    recs.push(`🎯 ${audit.missingKeywords.length} mots-clés encore à couvrir — les prochains articles s'en chargeront automatiquement.`);
  }
  if (audit.articlesRemaining > 0) {
    recs.push(`📅 ${audit.articlesRemaining} article(s) prêt(s) à être publié(s) — prochaine publication dans 7 jours.`);
  } else {
    recs.push(`📚 Tous les articles de la bibliothèque ont été publiés — la rotation recommence depuis le début.`);
  }
  recs.push(`🔗 Partagez chaque nouvel article sur vos réseaux sociaux (Instagram, TikTok) pour accélérer l'indexation Google.`);
  recs.push(`📊 Connectez votre boutique à Google Search Console pour suivre les positions de vos mots-clés.`);
  return recs.map(r => `<li>${r}</li>`).join('');
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Point d'entrée principal ──────────────────────────────────────────────────

async function runWeeklySEOReport() {
  const startMs = Date.now();
  console.log('[SEO] Démarrage agent SEO hebdomadaire...');

  // 1. Sélectionner et publier l'article de la semaine
  console.log('[SEO] Sélection de l\'article...');
  const { article, isNew } = await selectNextArticle();
  console.log(`[SEO] Article : "${article.title}" (${isNew ? 'nouveau' : 'déjà publié, rotation'})`);

  let publishResult;
  if (isNew) {
    publishResult = await publishArticle(article);
  } else {
    publishResult = { success: true, title: article.title, url: null, skipped: true };
    console.log('[SEO] Tous les articles ont été publiés — rotation ignorée cette semaine');
  }
  console.log(`[SEO] Publication : ${publishResult.success ? 'OK ✓' : 'Erreur ✗'}`);

  // 2. Optimiser les meta du produit principal
  console.log('[SEO] Optimisation meta produit...');
  const productMeta = await optimizeProductMeta();
  console.log(`[SEO] Meta produit : ${productMeta.success ? 'OK ✓' : 'Erreur'}`);

  // 3. Audit du contenu existant
  console.log('[SEO] Audit contenu...');
  const contentAudit = await auditContent();
  console.log(`[SEO] ${contentAudit.articlesPublished} articles · ${contentAudit.coveredKeywords.length} mots-clés couverts`);

  const durationMs = Date.now() - startMs;

  // 4. Email rapport
  const html = buildSEOReportHtml(publishResult, productMeta, contentAudit, durationMs);
  const date = new Date().toLocaleDateString('fr-FR');

  await sendEmail(
    `🔍 SatinNuit — Rapport SEO du ${date} · ${contentAudit.articlesPublished} articles · ${Math.round((contentAudit.coveredKeywords.length/(contentAudit.coveredKeywords.length+contentAudit.missingKeywords.length))*100)||0}% mots-clés`,
    html,
  );

  console.log('[SEO] Rapport SEO hebdomadaire envoyé ✓');

  return { publishResult, productMeta, contentAudit };
}

module.exports = { runWeeklySEOReport };
