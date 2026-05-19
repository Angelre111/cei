with open(r'c:\laragon\www\cei\dump_test.sql', 'r', encoding='utf-16') as f:
    content = f.read()

# Let's print sections around CREATE TABLE public.proyectos_aprendizaje
idx = content.find('CREATE TABLE public.proyectos_aprendizaje')
if idx != -1:
    print(content[idx:idx+1500])

print("\n--- References to proyectos_aprendizaje in ALTER TABLE or CREATE TRIGGER ---")
for line in content.splitlines():
    if ('proyectos_aprendizaje' in line) and ('ALTER TABLE' in line or 'TRIGGER' in line or 'FOREIGN KEY' in line):
        print(line)
