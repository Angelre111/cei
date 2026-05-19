with open(r'c:\laragon\www\cei\dump_test.sql', 'r', encoding='utf-16') as f:
    content = f.read()

for line in content.splitlines():
    if 'proyectos_aprendizaje' in line and ('ALTER' in line or 'FOREIGN' in line or 'REFERENCES' in line or 'ADD' in line):
        print(line)
