import sys
import os
from unittest.mock import MagicMock, patch

original_path = list(sys.path)
sys.path = [p for p in sys.path if p not in ('', os.getcwd(), os.path.abspath('.'), os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))]

import supabase
sys.path = original_path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

with patch('supabase.create_client') as mock_create:
    mock_client = MagicMock()
    mock_create.return_value = mock_client
    from py.form_registro import supabase as imported_supabase

# Simulate the setUp patcher
def table_dispatcher(table_name):
    print("table_dispatcher called for:", table_name)
    mock_q = MagicMock()
    if table_name == "usuarios":
        def select_side_effect(*args, **kwargs):
            cols = args[0] if args else ''
            print("select_side_effect called with:", cols)
            if cols in ("rol", "rol, estado"):
                m_exec = MagicMock()
                m_eq = MagicMock()
                m_exec.data = {'rol': 'administrador', 'estado': 'activo'}
                def eq_side_effect(field, val):
                    print(f"eq_side_effect called: eq({field}, {val})")
                    m_eq_child = MagicMock()
                    m_single_child = MagicMock()
                    m_single_child.execute.return_value = m_exec
                    m_eq_child.single.return_value = m_single_child
                    m_eq_child.execute.return_value = m_exec
                    return m_eq_child
                m_eq.eq.side_effect = eq_side_effect
                return m_eq
        mock_q.select.side_effect = select_side_effect
    return mock_q

# Patch imported_supabase.table using patch.object
table_patcher = patch.object(imported_supabase, 'table')
mock_table = table_patcher.start()
mock_table.side_effect = table_dispatcher

print("--- Testing Mock Chain ---")
try:
    perfil = imported_supabase.table("usuarios").select("rol").eq("id", "admin_solicitante_id").single().execute()
    print("perfil.data:", perfil.data)
except Exception as e:
    print("Error during query chain:", e)

table_patcher.stop()
