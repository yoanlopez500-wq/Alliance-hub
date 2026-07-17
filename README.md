# Alliance Hub

Plataforma de torneos, rankings y ligas para comunidades de **Supremacy 1914**.

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

## Licencia

Proyecto de comunidad. No oficial. No afiliado a Bytro Games.
