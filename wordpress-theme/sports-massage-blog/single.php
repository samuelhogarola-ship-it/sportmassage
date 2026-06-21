<?php
if (!defined('ABSPATH')) {
    exit;
}

get_header();
?>
<main class="content-grid">
    <div class="content-main">
        <?php while (have_posts()) : the_post(); ?>
            <article <?php post_class('entry-card'); ?>>
                <div class="post-meta"><?php echo esc_html(get_the_date()); ?></div>
                <h1 class="entry-title"><?php the_title(); ?></h1>
                <div class="entry-content"><?php the_content(); ?></div>
            </article>
        <?php endwhile; ?>
    </div>
    <aside class="content-sidebar">
        <?php get_sidebar(); ?>
    </aside>
</main>
<?php
get_footer();
