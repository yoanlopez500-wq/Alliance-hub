/** units.ts — Etiquetas y categorías de tipos de unidad del exportador de Supremacy.
 * Las claves (unit_key) salen del slug de la cabecera del Excel (ver apiImport.ts);
 * el exportador repite alguna columna (p.ej. 'Dirigible' -> 'dirigible__2').
 */

export const UNIT_CATEGORY_META: Record<string, { label: string; icon: string; color: string }> = {
  ground: { label: 'Tierra', icon: '🛡️', color: '#81c784' },
  air: { label: 'Aire', icon: '✈️', color: '#4fc3f7' },
  naval: { label: 'Naval', icon: '⚓', color: '#ce93d8' },
  elite: { label: 'Élite', icon: '⭐', color: '#ffd54f' },
  structures: { label: 'Estructuras', icon: '🏚️', color: '#9fa8da' },
};

const UNIT_LABELS: Record<string, string> = {
  // Tierra
  infanteria: 'Infantería',
  caballeria: 'Caballería',
  artilleria: 'Artillería',
  light_artillery: 'Artillería ligera',
  tanque_ligero: 'Tanque ligero',
  tanque_pesado: 'Tanque pesado',
  coche_blindado: 'Coche blindado',
  canon_ferroviario: 'Cañón ferroviario',
  tropas_de_asalto: 'Tropas de asalto',
  // Aire
  caza: 'Caza',
  bombardero: 'Bombardero',
  dirigible: 'Dirigible',
  dirigible__2: 'Dirigible (2ª columna)',
  globo_aerostatico_naval: 'Globo aerostático',
  transporte_de_aeronaves: 'Transporte de aeronaves',
  // Naval
  submarino: 'Submarino',
  acorazado: 'Acorazado',
  crucero_ligero: 'Crucero ligero',
  barco_de_transporte: 'Barco de transporte',
  // Estructuras
  trinchera: 'Trinchera',
  nube_de_gas: 'Nube de gas',
  // Élite
  vizconde_allenby: 'Vizconde Allenby',
  georg_bruchmuller: 'Georg Bruchmüller',
  henry_hank_callahan: 'Henry "Hank" Callahan',
  orhan_kangal_demir: 'Orhan "Kangal" Demir',
  lawrence_de_arabia: 'Lawrence de Arabia',
  joseph_joffre: 'Joseph Joffre',
  tatiana_minchakievich: 'Tatiana Minchakievich',
  fiero_marco_martello: 'Fiero "Marco" Martello',
  togo_heihachiro: 'Tōgō Heihachirō',
  fiona_maeve_porter: 'Fiona "Maeve" Porter',
  john_j_pershing: 'John J. Pershing',
  johan_aardvark_maes: 'Johan "Aardvark" Maes',
  ivan_vedmid_kovalenko: 'Ivan "Vedmid" Kovalenko',
  lucien_laroche: 'Lucien Laroche',
  wilhelm_von_thaden: 'Wilhelm von Thaden',
  manfred_von_richthofen: 'Manfred von Richthofen',
  otto_hersing: 'Otto Hersing',
  arthur_mactavish: 'Arthur MacTavish',
  alvin_c_york: 'Alvin C. York',
  milunka_savic: 'Milunka Savić',
};

/** Etiqueta humana de una unit_key; fallback: base legible del slug. */
export function unitLabel(key: string): string {
  return UNIT_LABELS[key] ?? key.split('__')[0].replace(/_/g, ' ');
}

const ELITE_KEYS = new Set(Object.keys(UNIT_LABELS).filter((k) => !['infanteria','caballeria','artilleria','light_artillery','tanque_ligero','tanque_pesado','coche_blindado','canon_ferroviario','tropas_de_asalto','caza','bombardero','dirigible','dirigible__2','globo_aerostatico_naval','transporte_de_aeronaves','submarino','acorazado','crucero_ligero','barco_de_transporte','trinchera','nube_de_gas'].includes(k)));

/** Categoria de una unit_key. Espejo del CASE de la vista public_player_unit_category_stats. */
export function unitCategoryOf(key: string): string {
  if (ELITE_KEYS.has(key)) return 'elite';
  if (['caza','bombardero','dirigible','dirigible__2','globo_aerostatico_naval','transporte_de_aeronaves'].includes(key)) return 'air';
  if (['submarino','acorazado','crucero_ligero','barco_de_transporte'].includes(key)) return 'naval';
  if (['trinchera','nube_de_gas'].includes(key)) return 'structures';
  return 'ground';
}
