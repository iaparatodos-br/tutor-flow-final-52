# TutorFlow

TutorFlow is a comprehensive SaaS platform designed for private tutors to manage their students, schedule, and finances. It offers a modern and intuitive interface to streamline the administrative tasks of teaching.

## Features

- **Dashboard**: Overview of your business metrics.
- **Student Management**: Manage student profiles and details.
- **Scheduling**: Calendar view for classes and appointments.
- **Financials**: Track earnings, invoices, and payments.
- **Materials**: Organize and share teaching materials.
- **Student Portal**: Dedicated area for students to access their information.

## Technology Stack

- **Frontend**: React, Vite, TypeScript
- **Styling**: TailwindCSS, Shadcn UI
- **Backend/Database**: Supabase
- **State Management**: React Query

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or bun

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   ```

2. Navigate to the project directory:
   ```bash
   cd tutor-flow-final-52
   ```

3. Install dependencies:
   ```bash
   npm install
   # or
   bun install
   ```

### Running the Application

To start the development server:

```bash
npm run dev
# or
bun dev
```

The application will be available at `http://localhost:8080`.

### Building for Production

To build the application for production:

```bash
npm run build
# or
bun run build
```

## Project Structure

- `src/`: Source code for the React application.
  - `components/`: Reusable UI components.
  - `pages/`: Application pages and routes.
  - `contexts/`: React contexts for state management.
  - `hooks/`: Custom React hooks.
  - `lib/`: Utility functions and configurations.
- `supabase/`: Supabase configuration and migrations.
- `public/`: Static assets.

## Scripts

- `dev`: Starts the development server.
- `build`: Builds the application for production.
- `lint`: Runs ESLint to check for code quality issues.
- `preview`: Previews the production build locally.

## License

[Add License Information Here]
