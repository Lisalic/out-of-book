# Lichess standard sounds

Unmodified recordings from the [standard sound directory](https://github.com/lichess-org/lila/tree/3a5a2c5a1ef0abbfa74fccf06c50582c2d0dad65/public/sound/standard),
not the `sfx` pack.

Pinned upstream revision: `3a5a2c5a1ef0abbfa74fccf06c50582c2d0dad65`.
Each file was verified against its upstream Git blob ID.

| File | Application events | Upstream Git blob ID |
| --- | --- | --- |
| `Move.mp3` | Move, castle, checking move | `7ed0cf66581fd7c1e3dc8b08303db12d9ef55f1f` |
| `Capture.mp3` | Capture | `ab51d763de8c3711e89ad7fbd23e99c360b3c062` |
| `Error.mp3` | Illegal or rejected move | `af769c0e910ac02c544bf4c0672870dc04739d9e` |
| `Confirmation.mp3` | Promotion | `f941eaccf786457404e26552b63e41a721e4b5ed` |
| `GenericNotify.mp3` | Game end | `61bb1b60fb2255dbe4727273110b5f36b2ad140a` |

Upstream `Check.mp3` points to `../Silence.mp3`, so the application retains
the normal move cue for checks rather than replacing it with silence.
Upstream `Victory.mp3`, `Defeat.mp3`, and `Draw.mp3` point to `GenericNotify.mp3`.
Promotion uses the standard pack's confirmation recording as an application-specific mapping.

## Rights notice

The included [upstream copying notice](COPYING.md) lists the other sounds in
`public/sound` under non-free exceptions. No redistribution license has been
verified for this standard pack. These assets are not represented as MIT, CC0,
or AGPL-licensed. Attribution and inclusion here do not grant redistribution rights;
obtain permission or clarify the license before distributing these recordings.
