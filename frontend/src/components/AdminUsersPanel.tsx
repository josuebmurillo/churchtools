import React from 'react';
import { useUsers } from '../services/users';

const AdminUsersPanel: React.FC = () => {
  const { data: users = [], isLoading, error } = useUsers();

  return (
    <section className="admin-users-panel">
      <h2>Usuarios</h2>
      <button className="action-button primary" style={{ float: 'right', marginBottom: 8 }}>
        + Crear usuario
      </button>
      {isLoading && <div>Cargando usuarios...</div>}
      {error && <div style={{ color: 'red' }}>Error al cargar usuarios</div>}
      <table className="users-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Usuario</th>
            <th>Email</th>
            <th>Activo</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>{user.id}</td>
              <td>{user.username}</td>
              <td>{user.email}</td>
              <td>{user.activo ? 'Sí' : 'No'}</td>
              <td>
                <button className="action-button small">Editar</button>
                <button className="action-button small danger">Eliminar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};

export default AdminUsersPanel;
