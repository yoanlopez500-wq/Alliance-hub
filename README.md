# Alliance Hub

Plataforma de torneos, rankings y ligas para comunidades de **Supremacy 1914**.

**Sitio en produccion:** https://alliancehub.app

## Stack Tecnologico

| Capa | Tecnologia |
|------|-----------|
| Frontend | HTML5 + Tailwind CSS (CDN) + Vanilla JS |
| Backend | Supabase (PostgreSQL + Auth + Realtime) |
| Auth | Supabase Auth (JWT) |
| Hosting | GitHub Pages |
| PWA | Service Worker + Manifest |

## Arquitectura de Modulos JS (v19)

```
assets/js/
├── config.js          # Supabase client init
├── base.js            # Utilidades globales (formatDate, showToast, etc.)
├── db-schema.js       # Centralizador de schema DB (v19) - DB.from(), DB.select(), DB.col()
├── auth-core.js       # Autenticacion (login/logout/session/roles)
├── roles-data.js      # Jerarquia de roles y paneles de navegacion
├── nav-engine.js      # Navegacion dual (admin/jugador)
├── messaging.js       # Chat y mensajeria
├── notifications.js   # Notificaciones push
├── training.js        # Sistema de capacitacion
├── components.js      # Componentes UI reutilizables
├── theme.js           # Tema oscuro/claro
├── pwa-utils.js       # Instalacion PWA
└── sw-register.js     # Registro del Service Worker
```

## Tablas Principales (DB)

| Tabla | Proposito |
|-------|-----------|
| `players` | Jugadores registrados |
| `alliances` | Alianzas y sus lideres |
| `matches` | Partidas y torneos |
| `match_registrations` | Registro de jugadores a partidas |
| `match_results` | Estadisticas de partida (kills/deaths) |
| `match_winners` | Podio de ganadores |
| `alliance_memberships` | Membresias de alianza |
| `alliance_officers` | Oficiales y permisos |
| `rule_sections` | Secciones del reglamento |
| `rule_precedents` | Precedentes y jurisprudencia |
| `player_strikes` | Strikes aplicados a jugadores |
| `strike_types` | Tipos de strikes configurables |
| `player_reports` | Reportes de jugadores |
| `chat_messages` | Chat de partidas |
| `admin_users` | Administradores |

## Jerarquia de Roles

```
superadmin > event_admin > moderator > alliance_leader > co_leader > officer
```

| Rol | Capacidades |
|-----|------------|
| superadmin | Todo CRUD, editar/eliminar precedentes, gestion de admins |
| event_admin | Crear partidas, gestionar torneos, importar CSV, comite de revision |
| moderator | Gestionar reportes, aplicar strikes, moderar chat, comite de revision |
| alliance_leader | Panel de alianza, crear partidas internas, gestionar miembros |
| co_leader | Mismo que lider con restricciones |
| officer | Ver strikes, gestionar miembros basicos |

## Flujo de Strikes y Precedentes

1. **Moderator** crea un strike con status `pending_precedent`
2. **Comite de Revision** (superadmin/event_admin) aprueba/rechaza
3. Si se aprueba: status cambia a `active` y se vincula un precedente
4. Si se rechaza: status cambia a `rejected`
5. **Solo superadmin** puede editar/eliminar precedentes existentes

## Iniciar el Proyecto

1. Clonar el repo:
```bash
git clone https://github.com/yoanlopez500-wq/aliance-hub.git
cd aliance-hub
```

2. Configurar Supabase:
   - Crear proyecto en [Supabase](https://supabase.com)
   - Ejecutar `schema.sql` en el SQL Editor
   - Copiar URL y anon key a `assets/js/config.js`

3. Ejecutar setup inicial:
```sql
SELECT complete_setup();
```

4. Desplegar:
   - Push a `main` branch
   - Activar GitHub Pages desde Settings

## Convenciones de Codigo

- **Versionado**: usar `assets/js/cache-buster.js` + `assets/js/loader.js`. El loader aplica `?h=YYYYMMDD` automaticamente. No usar `?v=XX` manualmente.
- **DB**: Usar `DB.from('tableKey')`, `DB.select('tableKey', 'setName')`, `DB.col('tableKey', 'colKey')`
- **Auth**: Usar `auth-core.js` directamente (no el shim legacy `auth.js`)
- **Tabs**: Tablas de 2 espacios en JS, 4 en HTML

## Seguridad y Configuracion Sensible

Este repositorio es publico **a proposito**: cualquier alianza puede copiarlo y montar su propia instancia. Lo que ves aqui es seguro de exponer por diseno:

**Publico por diseno (esta bien que este aqui):**
- La `anon key` de Supabase (`sb_publishable_...`): esta hecha para ser publica. La seguridad real vive en el backend (Row Level Security + RPCs `security definer`), no en ocultar la key.
- La llave publica VAPID (notificaciones push): tambien esta disenada para exponerse al navegador.
- La estructura del proyecto y `schema.sql`: documentacion del esquema real. Supabase expone la estructura de tablas via su API REST de todas formas.

**NUNCA en el repo (excluidos via .gitignore y verificados con escaneo de historial):**
- `service_role` key de Supabase (vive solo como variable de entorno en Edge Functions)
- Llave privada VAPID y `hook_secret` de push (viven en la tabla sellada `push_config`, solo legible con service role)
- Archivos `.env` y cualquier secreto local

Si montas tu propia instancia: crea tu proyecto Supabase, aplica `schema.sql` como referencia, y guarda tus secretos en variables de entorno — nunca en el codigo.

## Licencia

Proyecto de comunidad, independiente y sin animo de lucro. No oficial. **No afiliado, asociado, patrocinado ni respaldado por Bytro Labs GmbH ni Stillfront Group AB.** Supremacy 1914 es marca de sus respectivos titulares. Alliance Hub no usa ninguna API ni dato interno del juego: las estadisticas deportivas se calculan con herramientas externas de terceros y datos aportados por la comunidad, en cumplimiento del EULA de Supremacy 1914. Ver [aviso-legal.html](aviso-legal.html).
