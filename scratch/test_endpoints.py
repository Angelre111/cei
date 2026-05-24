import sys
import os
import unittest
from unittest.mock import MagicMock, patch

# Save original path and exclude local directory to load installed supabase library
original_path = list(sys.path)
sys.path = [p for p in sys.path if p not in ('', os.getcwd(), os.path.abspath('.'), os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))]

import supabase

# Restore path and append workspace parent directory to find py.form_registro package
sys.path = original_path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Set up environment variables so form_registro doesn't crash on load
os.environ['SUPABASE_URL'] = 'https://example.supabase.co'
os.environ['SUPABASE_SERVICE_ROLE_KEY'] = 'fake_service_role'
os.environ['SUPABASE_ANON_KEY'] = 'fake_anon_key'

# Mock Supabase clients before importing form_registro
with patch('supabase.create_client') as mock_create:
    mock_client = MagicMock()
    mock_create.return_value = mock_client
    from py.form_registro import app, supabase, supabase_auth

class TestAdminAndTeacherEndpoints(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.client.testing = True

        # Clear mock calls
        supabase.reset_mock()
        supabase_auth.reset_mock()

        # Mock current user authentication
        self.mock_user = MagicMock()
        self.mock_user.id = 'admin_solicitante_id'
        
        self.get_user_patcher = patch.object(supabase_auth.auth, 'get_user')
        self.mock_get_user = self.get_user_patcher.start()
        
        mock_response = MagicMock()
        mock_response.user = self.mock_user
        self.mock_get_user.return_value = mock_response

        # Setup patcher for table
        self.table_patcher = patch.object(supabase, 'table')
        self.mock_table = self.table_patcher.start()
        self.mock_table.side_effect = self.table_dispatcher

        print("DEBUG SETUP:")
        print("supabase is mock_client:", supabase is mock_client)
        print("supabase.table is mock_table:", supabase.table is self.mock_table)
        print("type(supabase.table):", type(supabase.table))

        # Default query variables
        self.solicitante_role = 'administrador'
        self.target_user_role = 'docente'
        self.target_user_estado = 'activo'
        self.admin_count = 2
        self.email_exists = False
        self.teacher_sections = []
        self.has_records_in_sections = False

        # Setup patcher for table
        self.table_patcher = patch.object(supabase, 'table')
        self.mock_table = self.table_patcher.start()
        self.mock_table.side_effect = self.table_dispatcher

    def tearDown(self):
        self.get_user_patcher.stop()
        self.table_patcher.stop()

    def table_dispatcher(self, table_name):
        mock_q = MagicMock()

        if table_name == "usuarios":
            def select_side_effect(*args, **kwargs):
                cols = args[0] if args else ''
                
                # Case 1: Fetching roles/states
                if cols in ("rol", "rol, estado"):
                    m_exec = MagicMock()
                    m_eq = MagicMock()
                    m_exec.data = {'rol': self.solicitante_role, 'estado': 'activo'}
                    
                    def eq_side_effect(field, val):
                        m_eq_child = MagicMock()
                        if val == 'admin_solicitante_id':
                            m_exec.data = {'rol': self.solicitante_role, 'estado': 'activo'}
                        else:
                            m_exec.data = {'rol': self.target_user_role, 'estado': self.target_user_estado}
                            
                        m_single_child = MagicMock()
                        m_single_child.execute.return_value = m_exec
                        m_eq_child.single.return_value = m_single_child
                        m_eq_child.execute.return_value = m_exec
                        return m_eq_child
                        
                    m_eq.eq.side_effect = eq_side_effect
                    return m_eq

                # Case 2: Counting admins
                elif cols == "id" and kwargs.get('count') == 'exact':
                    m_exec = MagicMock()
                    m_exec.count = self.admin_count
                    
                    m_eq = MagicMock()
                    m_neq = MagicMock()
                    m_neq.neq.return_value.execute.return_value = m_exec
                    m_eq.eq.return_value = m_neq
                    return m_eq

                # Case 3: Checking if email exists
                elif cols == "id":
                    m_exec = MagicMock()
                    m_exec.data = [{'id': 'existing_id'}] if self.email_exists else []
                    
                    m_eq = MagicMock()
                    m_eq.eq.return_value.execute.return_value = m_exec
                    return m_eq

                return MagicMock()

            mock_q.select.side_effect = select_side_effect
            
            # Mock update and delete executions
            mock_q.update.return_value.eq.return_value.execute.return_value = MagicMock()
            mock_q.delete.return_value.eq.return_value.execute.return_value = MagicMock()
            return mock_q

        elif table_name == "docentes_secciones":
            m_exec = MagicMock()
            m_exec.data = [{'seccion_id': s_id} for s_id in self.teacher_sections]
            
            m_eq = MagicMock()
            m_eq.eq.return_value.execute.return_value = m_exec
            mock_q.select.return_value = m_eq
            
            mock_q.delete.return_value.eq.return_value.execute.return_value = MagicMock()
            return mock_q

        elif table_name in ("asignaciones_estudiantes", "asistencias", "proyectos_aprendizaje", "banco_recomendaciones"):
            m_exec = MagicMock()
            m_exec.count = 1 if self.has_records_in_sections else 0
            
            m_in = MagicMock()
            m_limit = MagicMock()
            m_limit.limit.return_value.execute.return_value = m_exec
            m_in.in_.return_value = m_limit
            mock_q.select.return_value = m_in
            return mock_q

        elif table_name == "perfiles_personal":
            mock_q.delete.return_value.eq.return_value.execute.return_value = MagicMock()
            mock_q.insert.return_value.execute.return_value = MagicMock()
            return mock_q

        return mock_q

    def test_crear_personal_admin_limit_exceeded(self):
        self.solicitante_role = 'administrador'
        self.admin_count = 4 # Exceeds/Equal limit

        response = self.client.post('/api/crear_personal', 
                                    headers={'Authorization': 'Bearer token'},
                                    json={'email': 'test_admin@example.com', 'rol': 'administrador'})
        
        self.assertEqual(response.status_code, 400)
        self.assertIn('No se pueden registrar más de 4 administradores', response.json['message'])

    def test_crear_personal_admin_limit_ok(self):
        self.solicitante_role = 'administrador'
        self.admin_count = 2 # Below limit
        self.email_exists = False

        # Set up auth invitation mock
        mock_auth_res = MagicMock()
        mock_auth_res.user.id = 'new_admin_id'
        supabase_auth.auth.admin.invite_user_by_email.return_value = mock_auth_res

        response = self.client.post('/api/crear_personal', 
                                    headers={'Authorization': 'Bearer token'},
                                    json={'email': 'test_admin2@example.com', 'rol': 'administrador'})
        
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.json['success'])

    def test_editar_usuario_admin_limit_exceeded(self):
        self.solicitante_role = 'administrador'
        self.target_user_role = 'docente'
        self.target_user_estado = 'activo'
        self.admin_count = 4

        response = self.client.put('/api/usuarios/user_to_edit_id',
                                   headers={'Authorization': 'Bearer token'},
                                   json={'rol': 'administrador', 'nombres': 'Pepito', 'apellidos': 'Perez'})
        
        self.assertEqual(response.status_code, 400)
        self.assertIn('No se puede activar o asignar el rol de Administrador', response.json['message'])

    def test_eliminar_usuario_docente_soft_delete(self):
        self.solicitante_role = 'administrador'
        self.target_user_role = 'docente'
        self.teacher_sections = ['sec1']
        self.has_records_in_sections = True

        response = self.client.delete('/api/usuarios/docente_with_records_id',
                                      headers={'Authorization': 'Bearer token'})
        
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json['soft_deleted'])
        self.assertIn('desactivado (soft-delete)', response.json['message'])

    def test_eliminar_usuario_docente_hard_delete(self):
        self.solicitante_role = 'administrador'
        self.target_user_role = 'docente'
        self.teacher_sections = [] # No sections -> hard delete
        self.has_records_in_sections = False

        # Mock delete auth user
        supabase.auth.admin.delete_user.return_value = MagicMock()

        response = self.client.delete('/api/usuarios/docente_no_records_id',
                                      headers={'Authorization': 'Bearer token'})
        
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json['soft_deleted'])
        self.assertIn('eliminado del sistema correctamente', response.json['message'])

if __name__ == '__main__':
    unittest.main()
