# Smart Media

Plataforma privada de revisión audiovisual para creadores, editores y agencias.

## Stack
- React + TypeScript + Vite
- Tailwind CSS
- Supabase Auth, PostgreSQL, RLS y Storage privado
- React Router y Lucide

## Estado actual
Este repositorio contiene el punto de partida funcional de la aplicación. La autenticación y las operaciones con proyectos, videos y comentarios requieren conectar un proyecto Supabase y ejecutar la migración SQL. No se incluyen credenciales reales ni datos de clientes.

## Requisitos
- Node.js 20+
- Proyecto Supabase propio

## Desarrollo local
1. Instala dependencias: `npm install`
2. Copia `.env.example` a `.env` y añade la URL y la clave pública (anon/publishable) de Supabase.
3. Ejecuta en Supabase SQL Editor el archivo `supabase/migrations/202610140001_initial_schema.sql`.
4. Ejecuta `npm run dev`.

## Configurar el primer administrador
Después de crear la cuenta del propietario y confirmar su correo, ejecuta manualmente en el SQL Editor de Supabase como propietario del proyecto, sustituyendo el correo:
```sql
update public.profiles
set role = 'admin', updated_at = now()
where id = (select id from auth.users where lower(email) = lower('TU_CORREO_ADMIN'));
```
Este procedimiento es manual y requiere acceso privilegiado al proyecto Supabase. Nunca expongas la clave `service_role` en el navegador.

## Seguridad y producción
- Los videos se guardan en un bucket privado.
- RLS controla acceso a perfiles, proyectos, membresías, videos y comentarios.
- La aplicación genera URLs firmadas de corta duración para reproducir videos autorizados.
- Configura la confirmación de correo, URL de sitio y redirecciones permitidas en Supabase Auth.
- Configura límites de tamaño y tipos MIME en Storage según las capacidades del plan.
- Antes de producción, completa pruebas E2E, revisión de seguridad, aviso de privacidad y términos adaptados al responsable real del servicio.

## Variables de entorno
Consulta `.env.example`. Las variables Vite son públicas por diseño: solo debe ir la URL y la clave pública de Supabase. Nunca coloques secretos de servidor ahí.
