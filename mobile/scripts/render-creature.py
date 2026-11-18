"""Regenerate the bundled mascot loops with Python, moderngl and Pillow."""
from math import pi, sin
from pathlib import Path
from struct import pack

import moderngl
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FPS = 60
SECONDS = 6
FRAMES = FPS * SECONDS
DURATIONS = [round((i + 1) * 1000 / FPS) - round(i * 1000 / FPS) for i in range(FRAMES)]


def main():
    try:
        gl = moderngl.create_standalone_context(backend="egl")
    except (ValueError, RuntimeError):
        gl = moderngl.create_standalone_context()
    program = gl.program(
        vertex_shader="#version 330\nin vec2 p; void main() {gl_Position=vec4(p,0,1);}",
        fragment_shader=(ROOT / "scripts/creature.frag").read_text(),
    )
    vertices = gl.buffer(pack("6f", -1, -1, 3, -1, -1, 3))
    triangle = gl.simple_vertex_array(program, vertices, "p")
    program["pk"].value = (0.62, 0.58, 1.0)
    output = ROOT / "assets/creature"
    output.mkdir(exist_ok=True)

    for name, size, eyes, hue in [
        ("eyes", 144, True, 0),
        ("eyes-large", 320, True, 0),
        ("plain", 192, False, 0),
        ("anonymous", 160, False, 40),
        ("business", 160, True, -50),
    ]:
        target = gl.simple_framebuffer((size, size), components=4)
        target.use()
        program["r"].value = (size, size)
        program["V"].value = float(eyes)
        program["hue"].value = hue
        frames = []
        for i in range(FRAMES):
            t = i / FPS
            phase = t % 3
            program["t"].value = t if eyes else t + 1.7
            program["blink"].value = sin((phase - 2.72) * pi / 0.28) if phase > 2.72 else 0
            triangle.render()
            frame = Image.frombytes("RGBA", (size, size), target.read(components=4))
            frames.append(frame.transpose(Image.Transpose.FLIP_TOP_BOTTOM))
        frames[0].save(output / f"{name}.webp", save_all=True, append_images=frames[1:],
                       duration=DURATIONS, loop=0, quality=82, method=3)
        target.release()


if __name__ == "__main__":
    main()
