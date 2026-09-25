import { colors, styles } from '../../theme';
import Reveal from '../../components/Reveal';

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: '1. Naturaleza del proyecto',
    body: (
      <>
        <p>Alliance Hub es un <strong>proyecto comunitario, independiente y sin animo de lucro</strong>, creado y mantenido por jugadores para organizar torneos, ligas, rankings y arbitraje dentro de la comunidad de Supremacy 1914.</p>
        <p>Alliance Hub <strong>no forma parte de, no pertenece a, ni esta afiliado, asociado, patrocinado, avalado o respaldado por Bytro Labs GmbH ni por Stillfront Group AB</strong> (su empresa matriz), ni por ninguna de sus filiales o marcas.</p>
      </>
    ),
  },
  {
    title: '2. Propiedad intelectual',
    body: (
      <>
        <p><strong>Supremacy 1914</strong> y todos los nombres, logotipos, marcas y contenidos del juego son propiedad de <strong>Bytro Labs GmbH / Stillfront Group AB</strong> o de sus respectivos titulares. Su mencion en este sitio es meramente referencial, para identificar el juego al que sirve esta comunidad.</p>
        <p>El codigo, el reglamento competitivo, los rankings y el resto del contenido original de Alliance Hub pertenecen a la comunidad que los mantiene.</p>
      </>
    ),
  },
  {
    title: '3. Origen de los datos y cumplimiento del EULA',
    body: (
      <>
        <p>Alliance Hub <strong>no utiliza ninguna API oficial, dato interno, scraping ni recurso propietario de Supremacy 1914</strong>. Ningun sistema de esta plataforma se conecta a los servidores del juego ni accede a cuentas de jugadores.</p>
        <p>Las estadisticas deportivas (bajas, muertes, rendimiento) se obtienen de:</p>
        <ul>
          <li><strong>Herramientas externas de terceros</strong> que exportan estadisticas publicas de la partida en formato Excel, revisadas e importadas manualmente por los administradores.</li>
          <li><strong>Datos aportados directamente por la comunidad</strong> (capitanes, arbitros y jugadores) mediante formularios y evidencias.</li>
        </ul>
        <p>Todo el procesamiento se realiza de forma externa al juego y <strong>en cumplimiento del EULA de Supremacy 1914</strong>: no modificamos el cliente, no automatizamos acciones dentro del juego ni interferimos en su funcionamiento.</p>
      </>
    ),
  },
  {
    title: '4. Enlaces al juego',
    body: <p>Los enlaces de "Unirse a la partida" apuntan al sitio web oficial del juego (supremacy1914.es / supremacy1914.com). Al seguirlos, el usuario abandona Alliance Hub y queda sujeto a los terminos y politicas de Bytro Labs.</p>,
  },
  {
    title: '5. Contacto',
    body: <p>Si representas a Bytro Labs o Stillfront Group y tienes cualquier observacion sobre este proyecto, o si eres jugador y tienes dudas sobre el tratamiento de tus datos, escribenos a <a href="mailto:admin@alliancehub.app" style={{ color: colors.accent }}>admin@alliancehub.app</a>.</p>,
  },
];

/** AvisoLegalPage — puerto de aviso-legal.html. */
export default function AvisoLegalPage() {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 16px' }}>
      <Reveal>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: colors.text }}>⚖️ Aviso Legal</h1>
        <p style={{ fontSize: 13, color: colors.muted }}>Ultima actualizacion: 21 de agosto de 2026</p>
      </Reveal>
      {SECTIONS.map((s, i) => (
        <Reveal key={s.title} delay={i * 60}>
          <section style={{ ...styles.card, marginTop: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: colors.accent, margin: '0 0 10px' }}>{s.title}</h2>
            <div style={{ fontSize: 14, color: colors.muted, lineHeight: 1.7 }}>
              {s.body}
            </div>
          </section>
        </Reveal>
      ))}
    </div>
  );
}
