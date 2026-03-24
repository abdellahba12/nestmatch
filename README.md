# 🏡 NestMatch

**Encuentra tu compañero de piso ideal.** Aplicación web full-stack estilo Tinder para buscar compañeros de piso — con sistema de swipe, chat en tiempo real, filtros por zona y suscripción Premium con Stripe.

---

## 🚀 Deploy en Railway (paso a paso)

### 1. Prepara el repositorio GitHub

```bash
git init
git add .
git commit -m "Initial commit — NestMatch"
git remote add origin https://github.com/TU_USUARIO/nestmatch.git
git push -u origin main
```

### 2. Crea el proyecto en Railway

1. Ve a [railway.app](https://railway.app) → **New Project**
2. Selecciona **Deploy from GitHub repo** → elige `nestmatch`
3. Railway detectará el `railway.json` automáticamente

### 3. Añade PostgreSQL

En Railway → tu proyecto → **+ New** → **Database** → **PostgreSQL**

Railway añadirá `DATABASE_URL` automáticamente como variable de entorno.

### 4. Configura las variables de entorno

En Railway → tu servicio → **Variables**, añade:

| Variable | Valor |
|---|---|
| `JWT_SECRET` | String aleatorio largo (ej: genera con `openssl rand -hex 32`) |
| `STRIPE_SECRET_KEY` | `sk_live_...` (o `sk_test_...` para pruebas) |
| `STRIPE_PRICE_ID` | ID del precio mensual en Stripe Dashboard |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` (del webhook en Stripe) |
| `FRONTEND_URL` | La URL de Railway (ej: `https://nestmatch-production.up.railway.app`) |
| `NODE_ENV` | `production` |

### 5. Configura Stripe

1. Ve a [dashboard.stripe.com](https://dashboard.stripe.com)
2. **Products** → **Add product** → nombre: "NestMatch Premium" → precio: 9.99€/mes recurrente
3. Copia el **Price ID** (`price_...`) → pégalo en `STRIPE_PRICE_ID`
4. **Developers** → **Webhooks** → **Add endpoint**
   - URL: `https://TU-APP.railway.app/api/payments/webhook`
   - Eventos: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
5. Copia el **Signing secret** (`whsec_...`) → pégalo en `STRIPE_WEBHOOK_SECRET`

### 6. Deploy

Railway hará el deploy automáticamente al hacer push. La base de datos se inicializa sola al arrancar el servidor.

---

## 🏗 Estructura del proyecto

```
nestmatch/
├── backend/
│   ├── db/
│   │   ├── index.js          # Conexión PostgreSQL
│   │   └── schema.sql        # Schema completo (auto-ejecutado al iniciar)
│   ├── middleware/
│   │   └── auth.js           # JWT + límite de swipes
│   ├── routes/
│   │   ├── auth.js           # Register, login, perfil
│   │   ├── users.js          # Discover, swipe, matches
│   │   ├── chat.js           # Mensajes REST
│   │   └── payments.js       # Stripe checkout, webhook, portal
│   └── server.js             # Express + Socket.io
├── frontend/
│   ├── css/
│   │   └── main.css          # Diseño responsive completo
│   ├── js/
│   │   ├── api.js            # Cliente API
│   │   ├── app.js            # Controlador principal + auth
│   │   ├── discover.js       # Swipe cards con drag & drop
│   │   ├── chat.js           # Chat en tiempo real
│   │   ├── profile.js        # Perfil de usuario
│   │   └── payments.js       # Stripe + matches
│   └── index.html            # SPA principal
├── .env.example
├── railway.json
├── Procfile
└── package.json
```

---

## ✨ Funcionalidades

### Usuarios
- Registro multi-paso (4 pasos: datos, historia, ubicación, preferencias)
- Login con JWT (token 30 días)
- Perfil completo: foto, bio, hobbies, zona, presupuesto, estilo de vida

### Descubrir
- Scroll de perfiles estilo Tinder con **drag & drop** (ratón y táctil)
- Filtros: ciudad, edad, presupuesto, género
- **Límite diario de 5 swipes gratuitos** (se resetea cada día a medianoche)
- Sistema de matches mutuos con popup animado

### Chat
- **WebSockets en tiempo real** (Socket.io)
- Indicador de "está escribiendo..."
- Notificaciones de mensajes nuevos
- Historial de conversaciones paginado

### Premium (Stripe)
- Suscripción mensual €9.99
- Swipes ilimitados
- Checkout seguro con Stripe
- Portal de facturación para cancelar/cambiar
- Webhooks para gestión automática del estado

### Técnico
- Base de datos PostgreSQL con índices optimizados
- Rate limiting (200 req/15min)
- Helmet para seguridad HTTP
- CORS configurado
- Health check endpoint `/api/health`
- Schema SQL auto-ejecutado al iniciar

---

## 🧪 Probar en local

```bash
# 1. Instala dependencias
npm install

# 2. Crea .env a partir de .env.example y rellénalo

# 3. Arranca (necesitas PostgreSQL local o usa DATABASE_URL de Railway)
npm run dev  # con nodemon
# o
npm start
```

Abre `http://localhost:3000`

---

## 📱 Responsive

- ✅ Móvil (320px+)
- ✅ Tablet
- ✅ Escritorio (centrado, max-width 420px estilo app)
- ✅ Safe area insets para iPhone (notch, home bar)
