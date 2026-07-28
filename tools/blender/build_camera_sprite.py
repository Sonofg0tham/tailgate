r"""
Tailgate CCTV camera sprite builder.

Builds the wall-mounted security camera prop from scratch inside Blender and
renders it straight down to two small transparent PNGs:

  public/assets/environment/cctv_camera.png
      The housing: wall bracket, arm, body, tilted lens barrel and hood, with a
      dark glass lens. Neutral greys only, never tinted in game.

  public/assets/environment/cctv_camera_lens.png
      A flat glow disc sitting exactly over the lens. The game tints this one
      per camera state (grey calm, amber curious, red alert, dim offline), so
      it is rendered white and carries no colour of its own.

Nothing is modelled by hand, so the art rebuilds from the repo alone and no
.blend binary is the source of truth. Every number that shapes the prop is a
constant near the top of this file.

Re-run it (Windows, from the repo root, one line):

  "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --python tools/blender/build_camera_sprite.py

Blender ships its own Python, so `import bpy` only works when the script is run
through blender.exe. Running it with the system Python will fail.

Output paths are resolved relative to this file, so the working directory does
not matter. Rendering is deterministic: fixed sample count, fixed seed, adaptive
sampling off and no random placement anywhere, so two runs produce pixel for
pixel identical images. The PNG files themselves still carry Blender's own
metadata, so the file hash can move even when the picture has not. Compare
pixels, not hashes, if you want to prove a change did nothing.

Art rules this script obeys (CLAUDE.md, non-negotiable):
  - Palette greys only: base #0E1116, sheet #151A21, cool grey #C7CDD4.
  - No clearance amber and no alarm red baked in. Both are runtime state
    colours, and red is reserved for detection and alarm alone.
  - Small and crisp, not a big soft render: the PNGs are 32x32 and the game
    draws them at 1:1 with pixelArt on, so no scaling blur is possible.
"""

import math
import os
import sys

import bpy
from mathutils import Vector

# --------------------------------------------------------------------------
# Output
# --------------------------------------------------------------------------

# Blender does not set __file__ the way a normal Python run does when the
# script is passed with --python, so fall back to scanning argv for the path.
def script_dir() -> str:
    here = globals().get("__file__")
    if not here:
        for index, arg in enumerate(sys.argv):
            if arg == "--python" and index + 1 < len(sys.argv):
                here = sys.argv[index + 1]
                break
    return os.path.dirname(os.path.abspath(here))


OUTPUT_DIR = os.path.normpath(
    os.path.join(script_dir(), "..", "..", "public", "assets", "environment")
)
HOUSING_PNG = os.path.join(OUTPUT_DIR, "cctv_camera.png")
LENS_PNG = os.path.join(OUTPUT_DIR, "cctv_camera_lens.png")

# --------------------------------------------------------------------------
# Render settings
# --------------------------------------------------------------------------

# 32x32 is the size the game draws these at, 1:1. Rendering at the display size
# is what keeps the sprite crisp: nothing is ever resampled.
RENDER_PX = 32
# World units across the frame. 3.2 units over 32 pixels gives exactly 10
# pixels per unit, which makes every dimension below easy to reason about.
ORTHO_SCALE = 3.2
SAMPLES = 512
# A tight reconstruction filter. Wider values are what make a small render look
# soft, so this stays under Blender's 1.5 default.
FILTER_WIDTH = 0.8

# --------------------------------------------------------------------------
# Palette, straight from src/config/palette.ts
# --------------------------------------------------------------------------

BASE = (0x0E, 0x11, 0x16)
SHEET = (0x15, 0x1A, 0x21)
TEXT = (0xC7, 0xCD, 0xD4)


def grey(t: float) -> tuple:
    """A cool grey `t` of the way from the sheet colour to the UI text colour."""
    return tuple(SHEET[i] + (TEXT[i] - SHEET[i]) * t for i in range(3))


# Each surface picks a rung on that one ramp, so the prop can never drift off
# palette. A light body against a dark floor is the whole point: the old flat
# dark square was invisible.
COLOUR_MOUNT_PLATE = grey(0.34)
COLOUR_MOUNT_ARM = grey(0.46)
COLOUR_BODY = grey(0.58)
COLOUR_SPINE = grey(0.94)
COLOUR_BARREL = grey(0.40)
COLOUR_HOOD = grey(0.82)
COLOUR_LENS_GLASS = BASE

# --------------------------------------------------------------------------
# Shape. X is the way the camera looks, Z is up towards the render camera.
# --------------------------------------------------------------------------

# How far the barrel droops below horizontal. A real wall camera points down,
# and the droop is also what turns the lens face towards a top-down view.
BARREL_TILT_DEG = 45.0

# Tapered boxes: (x_back, x_front, half_y_back, half_y_front, z_bottom,
# z_top_back, z_top_front). The taper is doing real work here. Narrowing
# towards the lens is what tells a player which way the camera looks even
# before they find the barrel.
MOUNT_PLATE = (-1.20, -0.98, 0.56, 0.56, 0.0, 0.26, 0.26)
MOUNT_ARM = (-0.98, -0.66, 0.14, 0.14, 0.06, 0.28, 0.28)
BODY = (-0.66, 0.34, 0.48, 0.34, 0.0, 0.58, 0.52)
# A raised ridge down the middle of the housing, narrowing to the front. It is
# the brightest thing on the prop, and it points where the camera points.
SPINE = (-0.52, 0.28, 0.15, 0.07, 0.46, 0.66, 0.60)

# The barrel grows out of the body's front face and runs down the tilt.
BARREL_ROOT = Vector((0.30, 0.0, 0.36))
BARREL_RADIUS = 0.20
BARREL_LENGTH = 0.60
# A bright collar at the muzzle, with the dark lens glass sitting proud of it.
# A bright ring around a dark pupil is what makes the tip read as an eye.
HOOD_RADIUS = 0.30
HOOD_LENGTH = 0.22
HOOD_CENTRE_DISTANCE = 0.55
LENS_RADIUS = 0.22
LENS_THICKNESS = 0.07
LENS_DISTANCE = 0.68

# The tintable glow disc. Flat and facing the render camera, so it always reads
# as a clean round eye no matter how far the barrel is tilted.
LENS_GLOW_INNER_RADIUS = 0.20
LENS_GLOW_OUTER_RADIUS = 0.32
LENS_GLOW_OUTER_STRENGTH = 0.34

# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------


def srgb_to_linear(channel_255: float) -> float:
    """Blender shades in linear light, palette hex values are sRGB."""
    c = channel_255 / 255.0
    if c <= 0.04045:
        return c / 12.92
    return ((c + 0.055) / 1.055) ** 2.4


def linear_rgba(colour: tuple, alpha: float = 1.0) -> tuple:
    return (
        srgb_to_linear(colour[0]),
        srgb_to_linear(colour[1]),
        srgb_to_linear(colour[2]),
        alpha,
    )


def set_if_present(holder, name: str, value) -> None:
    """Sets an optional Blender property, so one API rename cannot break a run."""
    if hasattr(holder, name):
        setattr(holder, name, value)


def surface_material(name: str, colour: tuple, roughness: float):
    """A plain matte surface. No metallic, no gloss: this renders at 32 pixels."""
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    principled = material.node_tree.nodes["Principled BSDF"]
    for socket, value in (
        ("Base Color", linear_rgba(colour)),
        ("Roughness", roughness),
        ("Metallic", 0.0),
    ):
        if socket in principled.inputs:
            principled.inputs[socket].default_value = value
    return material


def emission_material(name: str, strength: float):
    """Flat white light. The game supplies the colour by tinting the sprite."""
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    tree = material.node_tree
    tree.nodes.clear()
    output = tree.nodes.new("ShaderNodeOutputMaterial")
    emission = tree.nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    emission.inputs["Strength"].default_value = strength
    tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])
    return material


def add_tapered_box(name: str, spec: tuple, material):
    """
    An eight point slab that may narrow towards the front and slope on top.
    Built from explicit vertices rather than a primitive so the taper is exact
    and the whole prop stays reproducible from these numbers alone.
    """
    x_back, x_front, hy_back, hy_front, z_bottom, z_top_back, z_top_front = spec
    verts = [
        (x_back, -hy_back, z_bottom),
        (x_back, hy_back, z_bottom),
        (x_front, hy_front, z_bottom),
        (x_front, -hy_front, z_bottom),
        (x_back, -hy_back, z_top_back),
        (x_back, hy_back, z_top_back),
        (x_front, hy_front, z_top_front),
        (x_front, -hy_front, z_top_front),
    ]
    # Wound so every normal faces outwards, which the shading depends on.
    faces = [
        (0, 1, 2, 3),
        (4, 7, 6, 5),
        (0, 4, 5, 1),
        (3, 2, 6, 7),
        (0, 3, 7, 4),
        (1, 5, 6, 2),
    ]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    mesh.update(calc_edges=True)
    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def barrel_axis_rotation() -> tuple:
    """
    Euler that swings a cylinder's default +Z axis onto the barrel direction.
    Rotating by theta about Y sends +Z to (sin theta, 0, cos theta), and the
    barrel points at (cos tilt, 0, -sin tilt), so theta is 90 degrees + tilt.
    """
    return (0.0, math.radians(90.0 + BARREL_TILT_DEG), 0.0)


def barrel_point(distance: float) -> Vector:
    """A point `distance` along the barrel axis from where it leaves the body."""
    tilt = math.radians(BARREL_TILT_DEG)
    direction = Vector((math.cos(tilt), 0.0, -math.sin(tilt)))
    return BARREL_ROOT + direction * distance


def add_barrel_cylinder(name: str, distance: float, radius: float, length: float, material):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=16,
        radius=radius,
        depth=length,
        location=barrel_point(distance),
        rotation=barrel_axis_rotation(),
    )
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(material)
    return obj


def add_flat_disc(name: str, centre: Vector, radius: float, material):
    """A disc lying flat, facing straight up at the render camera."""
    bpy.ops.mesh.primitive_circle_add(
        vertices=24, radius=radius, fill_type="NGON", location=centre
    )
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(material)
    return obj


def world_bounds_xy(objects):
    xs, ys = [], []
    for obj in objects:
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            xs.append(world.x)
            ys.append(world.y)
    return min(xs), max(xs), min(ys), max(ys)


# --------------------------------------------------------------------------
# Scene build
# --------------------------------------------------------------------------


def clear_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def build_lights() -> None:
    """
    Key from the image's upper left, weak fill from the lower right. Blender's
    image up is the sprite's up on screen, so the lit edge lands where a player
    expects it. The fill only stops the shadow side going to solid black.
    """
    for name, position, strength in (
        ("key", Vector((-3.0, 3.0, 5.0)), 3.6),
        ("fill", Vector((3.5, -2.5, 3.0)), 1.1),
    ):
        light_data = bpy.data.lights.new(name, type="SUN")
        light_data.energy = strength
        set_if_present(light_data, "angle", 0.0)
        light = bpy.data.objects.new(name, light_data)
        bpy.context.collection.objects.link(light)
        light.location = position
        light.rotation_euler = (-position).to_track_quat("-Z", "Y").to_euler()


def build_world() -> None:
    world = bpy.data.worlds.new("sprite_world")
    world.use_nodes = True
    background = world.node_tree.nodes["Background"]
    # A little flat ambient so nothing reads as a hole. Grey, never coloured.
    background.inputs["Color"].default_value = (0.06, 0.065, 0.07, 1.0)
    background.inputs["Strength"].default_value = 1.0
    bpy.context.scene.world = world


def build_camera() -> None:
    camera_data = bpy.data.cameras.new("ortho_top_down")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = ORTHO_SCALE
    camera = bpy.data.objects.new("ortho_top_down", camera_data)
    bpy.context.collection.objects.link(camera)
    # Straight down the -Z axis, image up along +Y, matching the game's top-down
    # view. No tilt: every other prop in the game is drawn flat from above.
    camera.location = (0.0, 0.0, 8.0)
    camera.rotation_euler = (0.0, 0.0, 0.0)
    bpy.context.scene.camera = camera


def build_housing() -> list:
    return [
        add_tapered_box(
            "mount_plate",
            MOUNT_PLATE,
            surface_material("mat_mount_plate", COLOUR_MOUNT_PLATE, 0.85),
        ),
        add_tapered_box(
            "mount_arm",
            MOUNT_ARM,
            surface_material("mat_mount_arm", COLOUR_MOUNT_ARM, 0.8),
        ),
        add_tapered_box(
            "body",
            BODY,
            surface_material("mat_body", COLOUR_BODY, 0.7),
        ),
        add_tapered_box(
            "spine",
            SPINE,
            surface_material("mat_spine", COLOUR_SPINE, 0.55),
        ),
        add_barrel_cylinder(
            "barrel",
            BARREL_LENGTH / 2.0,
            BARREL_RADIUS,
            BARREL_LENGTH,
            surface_material("mat_barrel", COLOUR_BARREL, 0.7),
        ),
        add_barrel_cylinder(
            "hood",
            HOOD_CENTRE_DISTANCE,
            HOOD_RADIUS,
            HOOD_LENGTH,
            surface_material("mat_hood", COLOUR_HOOD, 0.55),
        ),
        add_barrel_cylinder(
            "lens_glass",
            LENS_DISTANCE,
            LENS_RADIUS,
            LENS_THICKNESS,
            surface_material("mat_lens_glass", COLOUR_LENS_GLASS, 0.25),
        ),
    ]


def build_lens_glow() -> list:
    """
    The tintable eye. It sits above everything on Z and is only ever rendered on
    its own, so it never disturbs the housing pass. Two rings: a solid core and
    a softer surround, which survives tinting as a bright pupil in a dim halo.
    """
    centre = barrel_point(LENS_DISTANCE)
    outer = add_flat_disc(
        "lens_glow_outer",
        Vector((centre.x, centre.y, 1.2)),
        LENS_GLOW_OUTER_RADIUS,
        emission_material("mat_lens_glow_outer", LENS_GLOW_OUTER_STRENGTH),
    )
    inner = add_flat_disc(
        "lens_glow_inner",
        Vector((centre.x, centre.y, 1.25)),
        LENS_GLOW_INNER_RADIUS,
        emission_material("mat_lens_glow_inner", 1.0),
    )
    return [outer, inner]


def centre_on_housing(housing: list, extras: list) -> None:
    """
    Slides the whole prop so the housing's footprint is centred in the frame.
    The glow discs move with it, so the two PNGs stay pixel aligned and the game
    can stack them with no offset maths.
    """
    min_x, max_x, min_y, max_y = world_bounds_xy(housing)
    offset = Vector(((min_x + max_x) / 2.0, (min_y + max_y) / 2.0, 0.0))
    for obj in housing + extras:
        obj.location = obj.location - offset


def configure_render() -> None:
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = SAMPLES
    set_if_present(scene.cycles, "use_denoising", False)
    # Adaptive sampling stops early per pixel based on thread timing, so every
    # pixel gets the full fixed sample budget instead.
    set_if_present(scene.cycles, "use_adaptive_sampling", False)
    set_if_present(scene.cycles, "max_bounces", 3)
    set_if_present(scene.cycles, "seed", 0)
    set_if_present(scene.cycles, "use_animated_seed", False)
    set_if_present(scene.cycles, "pixel_filter_type", "BLACKMAN_HARRIS")
    set_if_present(scene.cycles, "filter_width", FILTER_WIDTH)
    set_if_present(scene.render, "filter_size", FILTER_WIDTH)

    scene.render.resolution_x = RENDER_PX
    scene.render.resolution_y = RENDER_PX
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 100

    # Standard, never AgX or Filmic. The palette must land where it was authored.
    set_if_present(scene.view_settings, "view_transform", "Standard")
    set_if_present(scene.view_settings, "look", "None")
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0


def render_pass(path: str, visible: list) -> None:
    visible_names = {obj.name for obj in visible}
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            obj.hide_render = obj.name not in visible_names
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("wrote {}".format(path))


def main() -> None:
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    clear_scene()
    build_world()
    build_camera()
    build_lights()
    housing = build_housing()
    glow = build_lens_glow()
    centre_on_housing(housing, glow)
    configure_render()
    render_pass(HOUSING_PNG, housing)
    render_pass(LENS_PNG, glow)


main()
