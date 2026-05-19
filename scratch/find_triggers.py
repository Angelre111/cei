with open(r'c:\laragon\www\cei\dump_test.sql', 'r', encoding='utf-16') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'proyectos_aprendizaje' in line:
        print(f"Line {i+1}: {line.strip()}")
